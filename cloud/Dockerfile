FROM mcr.microsoft.com/playwright:v1.49.1-jammy

WORKDIR /app
COPY cloud/package.json cloud/package-lock.json ./
RUN npm install --omit=dev
COPY cloud/server.mjs ./
COPY inject.js ./inject.js
ENV HUIXIAN_HOST=0.0.0.0
ENV PORT=8787
ENV HUIXIAN_DATA=/data
EXPOSE 8787
CMD ["node", "server.mjs"]
