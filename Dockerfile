# Frontend React (desde raíz: npm start → puerto 3003)
FROM node:20-alpine AS build

WORKDIR /app

# Copiar solo archivos de dependencias (package*.json incluye package.json y package-lock.json)
COPY package*.json ./
RUN npm ci

COPY . .
# Build con API apuntando al backend (en Docker: nombre del servicio 'backend')
ARG REACT_APP_API_URL=http://localhost:8000
ENV REACT_APP_API_URL=$REACT_APP_API_URL
ENV PORT=3003
RUN npm run build

# Servir build en el puerto 3003
FROM node:20-alpine
WORKDIR /app
RUN npm install -g serve
COPY --from=build /app/build ./build
EXPOSE 3003
CMD ["serve", "-s", "build", "-l", "3003"]
