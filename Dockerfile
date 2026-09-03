# Python 3.12, deliberately, not 3.13: programasweights pins
# llama-cpp-python<=0.3.19, and the cp313 linux wheel on the PAW index fails to
# install ("OSError: RECORD"). The cp312 wheel is fine, which also means no
# compiler is needed here at all.
#
# Those wheels are tagged linux_x86_64, so this image is x86-64 only. On arm64
# there is no wheel and pip would have to build llama.cpp from source.
FROM python:3.12-slim

COPY requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir \
        -r /tmp/requirements.txt \
        gunicorn \
        --extra-index-url https://pypi.programasweights.com/simple/ \
    && rm /tmp/requirements.txt

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
COPY --chown=claudish:claudish dictionary/ ./dictionary/

USER claudish
EXPOSE 8787

# One worker only: each would load its own copy of the model. Inference is
# serialised inside the app, so threads handle concurrent requests. The long
# timeout covers the first request, which downloads the base model.
CMD ["gunicorn", "--workers", "1", "--threads", "4", "--timeout", "600", \
     "--access-logfile", "-", "--bind", "0.0.0.0:8787", "server:app"]
