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



# docker build -t izkcoxstac4nnb8_ndehgxofaa8a:latest .

# docker run --rm -it \
#   -v $(pwd)/.results/mccfr:/app/.results/mccfr \
#   izkcoxstac4nnb8_ndehgxofaa8a:latest \
#   sh

## CREATE AWS ECR REPOSITORY AND STORE JSON OUTPUT IN (aws.json) FILE
# aws ecr create-repository \
#   --repository-name izkcoxstac4nnb8_ndehgxofaa8a \
#   --region $(aws configure get region)

## LOG DOCKER IMAGE WITH AWS ECR REPOSITORY URI
# aws ecr get-login-password \
#   --region $(aws configure get region) \
# | docker login \
#   --username AWS \
#   --password-stdin 159541763424.dkr.ecr.us-east-1.amazonaws.com/

## TAG LOCAL DOCKER IMAGE WITH AWS ECR REPOSITORY URI
# docker tag izkcoxstac4nnb8_ndehgxofaa8a:latest \
#     159541763424.dkr.ecr.us-east-1.amazonaws.com/izkcoxstac4nnb8_ndehgxofaa8a

## PUSH DOCKER IMAGE TO AWS ECR REPOSITORY URI
# docker push \
#     159541763424.dkr.ecr.us-east-1.amazonaws.com/izkcoxstac4nnb8_ndehgxofaa8a