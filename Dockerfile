# llama-cpp-python publishes no wheels, so it is compiled here once and the
# toolchain is left behind in the build stage.
FROM python:3.13-slim AS build

RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential cmake ninja-build \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build
COPY requirements.txt .

# Cap build parallelism: four concurrent C++ jobs will OOM a small box.
ENV CMAKE_BUILD_PARALLEL_LEVEL=2
RUN pip install --no-cache-dir --prefix=/install \
        -r requirements.txt \
        gunicorn \
        --extra-index-url https://pypi.programasweights.com/simple/


FROM python:3.13-slim AS runtime

COPY --from=build /install /usr/local

# The model cache lives on a volume so the ~710 MB download happens once.
ENV PAW_CACHE_DIR=/models \
    CLAUDISH_MAX_LOADED=2 \
    CLAUDISH_N_CTX=2048 \
    PYTHONUNBUFFERED=1

RUN useradd --create-home --uid 10001 claudish \
    && mkdir -p /models && chown claudish:claudish /models

WORKDIR /app
COPY --chown=claudish:claudish server.py ./
COPY --chown=claudish:claudish web/ ./web/
COPY --chown=claudish:claudish specs/ ./specs/

USER claudish
EXPOSE 8787

# One worker only: each would load its own copy of the model. Inference is
# serialised inside the app, so threads handle concurrent requests. The long
# timeout covers the first request, which downloads the base model.
CMD ["gunicorn", "--workers", "1", "--threads", "4", "--timeout", "600", \
     "--access-logfile", "-", "--bind", "0.0.0.0:8787", "server:app"]
