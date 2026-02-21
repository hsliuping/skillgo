FROM node:20-alpine

RUN apk add --no-cache git python3 py3-pip bash

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY server ./server
COPY runner ./runner

ENV RUNNER_PORT=3200
EXPOSE 3200
CMD ["node", "runner/index.js"]
