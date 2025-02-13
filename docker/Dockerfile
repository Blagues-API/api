FROM node:22.14.0 as base
WORKDIR /app

COPY --chown=node:node package.json yarn.lock ./
COPY --chown=node:node tsconfig.json ./

RUN sed -i 's/"postinstall": "husky install"/"postinstall": ""/' ./package.json

FROM base as builder

RUN yarn install

COPY --chown=node:node ./src ./src
COPY --chown=node:node ./prisma ./prisma
COPY --chown=node:node .env .

COPY --chown=node:node ./blagues.json ./

RUN npx prisma generate
RUN npx tsc

FROM base as production

RUN yarn install --frozen-lockfile

COPY --chown=node:node ./blagues.json .
COPY --chown=node:node --from=builder /app/dist ./dist
COPY --chown=node:node --from=builder /app/prisma ./prisma
COPY --chown=node:node --from=builder /app/node_modules/@prisma/client/ ./node_modules/@prisma/client/
COPY --chown=node:node --from=builder /app/node_modules/.prisma/client/ ./node_modules/.prisma/client/

ENV NODE_ENV=production

EXPOSE 4000

CMD node dist/index.js
