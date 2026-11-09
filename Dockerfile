FROM node:22-alpine
WORKDIR /app
COPY --chown=node:node package.json server.mjs index.html style.css icon.svg ./
COPY --chown=node:node src ./src
ENV HOST=0.0.0.0 PORT=7860
USER node
EXPOSE 7860
CMD ["node", "server.mjs"]
