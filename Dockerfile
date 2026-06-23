# Frontend React (desde raíz: npm start → puerto 3008)
FROM node:20-alpine AS build

WORKDIR /app

# Copiar solo archivos de dependencias (package*.json incluye package.json y package-lock.json)
COPY package*.json ./
RUN npm ci

COPY . .
# BUILD: API URL y base path (PUBLIC_URL vacío = app en raíz para Docker local; /monitoreo_vmt/ para producción)
ARG PUBLIC_URL=
ENV PUBLIC_URL=$PUBLIC_URL
# REACT_APP_API_URL se lee automáticamente desde .env.production al correr npm run build
ENV PORT=3008
RUN npm run build

# Servir build con Nginx (actuando como puente/proxy)
FROM nginx:alpine
# Copiar configuración de Nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf
# Crear directorios y copiar archivos para que el alias funcione
RUN mkdir -p /usr/share/nginx/html/monitoreo_vmt
COPY --from=build /app/build /usr/share/nginx/html/monitoreo_vmt
# También en la raíz para fallback
COPY --from=build /app/build /usr/share/nginx/html
EXPOSE 3008
CMD ["nginx", "-g", "daemon off;"]

