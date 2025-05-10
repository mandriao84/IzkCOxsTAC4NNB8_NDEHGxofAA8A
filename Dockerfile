FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN if [ -f package-lock.json ] && [ -s package-lock.json ]; then \
      npm ci; \
    else \
      echo "No dependencies to install, skipping npm ci"; \
    fi
COPY tests/MCCFR27Discards2.js tests/MCCFR27Discards2.js
RUN mkdir -p .results/mccfr
COPY .results/mccfr/keys.ndjson .results/mccfr/keys.ndjson
COPY .results/mccfr/scores.ndjson  .results/mccfr/scores.ndjson
CMD ["node", "tests/MCCFR27Discards2.js"]
