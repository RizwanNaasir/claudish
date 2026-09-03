# llama-cpp-python is compiled here rather than taken from a wheel.
#
# Two things force that. programasweights pins llama-cpp-python<=0.3.19, and
# PyPI publishes no wheels at all for it. The PAW index does publish Linux
# wheels, but their libggml-cpu.so is built with AVX-512, so on any CPU without
# it (Zen 2 and Zen 3 desktop parts included) the worker dies with SIGILL the
# moment a model loads. Its cp313 wheel also fails to install outright
# ("OSError: RECORD"), which is why this image is on 3.12.
#
# Building with GGML_NATIVE=OFF and AVX2/FMA/F16C on gives a binary that runs on
# any x86-64 machine from about 2013 onward, instead of one tied to whatever
# built it.
FROM python:3.12-slim AS build

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential cmake ninja-build \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /tmp/requirements.txt

ENV CMAKE_ARGS="-DGGML_NATIVE=OFF -DGGML_AVX=ON -DGGML_AVX2=ON -DGGML_FMA=ON -DGGML_F16C=ON -DGGML_AVX512=OFF" \
    CMAKE_BUILD_PARALLEL_LEVEL=4

RUN python -m venv /opt/venv \
    && /opt/venv/bin/pip install --no-cache-dir --upgrade pip \
    && /opt/venv/bin/pip install --no-cache-dir \
        --no-binary llama-cpp-python \
        -r /tmp/requirements.txt \
        gunicorn


FROM python:3.12-slim AS runtime

# libgomp is the OpenMP runtime the compiled llama.cpp links against; the slim
# images do not ship it, and without it libllama.so fails to load.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /opt/venv /opt/venv

# The model cache lives on a volume so the ~710 MB download happens once.
ENV PATH="/opt/venv/bin:$PATH" \
    PAW_CACHE_DIR=/models \
    CLAUDISH_MAX_LOADED=2 \
    CLAUDISH_N_CTX=2048 \
    PYTHONUNBUFFERED=1

RUN useradd --create-home --uid 10001 claudish \
    && mkdir -p /models && chown claudish:claudish /models

WORKDIR /app
COPY --chown=claudish:claudish server.py ./
COPY --chown=claudish:claudish web/ ./web/
COPY --chown=claudish:claudish specs/ ./specs/
COPY --chown=claudish:claudish dictionary/ ./dictionary/

USER claudish
EXPOSE 8787

# One worker only: each would load its own copy of the model. Inference is
# serialised inside the app, so threads handle concurrent requests. The long
# timeout covers the first request, which downloads the base model.
CMD ["gunicorn", "--workers", "1", "--threads", "4", "--timeout", "600", \
     "--access-logfile", "-", "--bind", "0.0.0.0:8787", "server:app"]
