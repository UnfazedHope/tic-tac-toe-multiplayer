FROM heroiclabs/nakama:3.7.0

# Copy Nakama configuration and JS modules
COPY server-data /nakama/data
COPY server-src /nakama/modules

ENV NAKAMA_RUNTIME_PATH=/nakama/modules

CMD sh -lc "\
  echo 'Starting Nakama with DB ${DATABASE_URL}'; \
  nakama migrate up --database.address=${DATABASE_URL} || true; \
  nakama --name nakama --database.address=${DATABASE_URL} --logger.level DEBUG --runtime.path ${NAKAMA_RUNTIME_PATH} \
"
