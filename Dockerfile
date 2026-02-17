# Frontend React (desde raíz: npm start → puerto 3003)
FROM node:20-alpine AS build

WORKDIR /app

# Copiar solo archivos de dependencias (package*.json incluye package.json y package-lock.json)
COPY package*.json ./
RUN npm ci

COPY . .
# BUILD: API URL y base path (PUBLIC_URL vacío = app en raíz para Docker local; /monitoreo_vmt/ para producción)
ARG REACT_APP_API_URL=http://localhost:8010
ARG PUBLIC_URL=
ENV REACT_APP_API_URL=$REACT_APP_API_URL
ENV PUBLIC_URL=$PUBLIC_URL
ENV PORT=3003
RUN npm run build

# Servir build con Nginx (actuando como puente/proxy)
FROM nginx:alpine
# Copiar configuración de Nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf
# Copiar archivos compilados
COPY --from=build /app/build /usr/share/nginx/html
EXPOSE 3003
CMD ["nginx", "-g", "daemon off;"]

