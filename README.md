# Sist. Transporte

Frontend React (puerto 3003) + Backend FastAPI (puerto 8010).

## Requisitos

- Node.js y npm (frontend, desde la raíz)
- Python 3.12+ y pip (backend, desde `backend/`)
- Opcional: Docker y Docker Compose

## Desarrollo local

### Frontend (raíz del proyecto, puerto 3003)

```bash
# Opcional: copiar .env.example a .env y poner PORT=3003 para que npm start use el puerto 3003
cp .env.example .env
npm install
npm start
```

Abre [http://localhost:3003](http://localhost:3003).

### Backend (carpeta backend, puerto 8010)

```bash
cd backend
pip install -r requirements.txt
# Configurar variables de BD en backend/.env
uvicorn main:app --reload
```

API en [http://localhost:8010](http://localhost:8010).

## Docker

```bash
# Crear backend/.env con las variables de base de datos (DB_CID_*, DB_MON_*, DB_BILL_*)
docker compose up --build
```

- Frontend: [http://localhost:3003](http://localhost:3003)
- Backend: [http://localhost:8010](http://localhost:8010)

## Despliegue en servidor (ej. http://172.16.222.222:3003/)

Para que la app funcione en un servidor, el frontend debe llamar al backend por la URL pública del servidor (no por localhost).

### Opción A: Docker en el servidor

1. Clonar o copiar el proyecto en el servidor (172.16.222.222).
2. Crear `backend/.env` con las variables de las bases de datos (igual que en desarrollo).
3. Definir la URL del API para el build del frontend. En la **raíz** del proyecto crear o editar `.env` (no confundir con `backend/.env`):
   ```env
   REACT_APP_API_URL=http://172.16.222.222:8010
   ```
4. Build y levantar:
   ```bash
   docker compose up --build -d
   ```
5. Abrir en el navegador: **http://172.16.222.222:3003/** (frontend) y **http://172.16.222.222:8010** (API).

### Opción B: Sin Docker en el servidor

1. **Backend:** en el servidor, en la carpeta `backend`:
   - Crear `backend/.env` con las variables de BD.
   - `pip install -r requirements.txt`
   - Ejecutar: `uvicorn main:app --host 0.0.0.0 --port 8010`
2. **Frontend:** en tu PC (o en el servidor) hacer un build apuntando al API del servidor:
   ```bash
   set REACT_APP_API_URL=http://172.16.222.222:8010
   npm run build
   ```
   Luego copiar la carpeta `build` al servidor y servirla con nginx, Apache o `serve -s build -l 3003`.

---

## Subir a GitHub

Repositorio: https://github.com/lprafael/sist_transporte

```bash
git remote add origin https://github.com/lprafael/sist_transporte.git
git branch -M main
git push -u origin main
```

Si ya tenés otro `origin`, usá `git remote set-url origin https://github.com/lprafael/sist_transporte.git` y después `git push -u origin main`.

---

## Available Scripts (Create React App)

In the project directory, you can run:

### `npm start`

Runs the app in the development mode.\
Open [http://localhost:3003](http://localhost:3003) to view it in your browser (usa `PORT=3003` en `.env` si hace falta).

The page will reload when you make changes.\
You may also see any lint errors in the console.

### `npm test`

Launches the test runner in the interactive watch mode.\
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

### `npm run build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

### `npm run eject`

**Note: this is a one-way operation. Once you `eject`, you can't go back!**

If you aren't satisfied with the build tool and configuration choices, you can `eject` at any time. This command will remove the single build dependency from your project.

Instead, it will copy all the configuration files and the transitive dependencies (webpack, Babel, ESLint, etc) right into your project so you have full control over them. All of the commands except `eject` will still work, but they will point to the copied scripts so you can tweak them. At this point you're on your own.

You don't have to ever use `eject`. The curated feature set is suitable for small and middle deployments, and you shouldn't feel obligated to use this feature. However we understand that this tool wouldn't be useful if you couldn't customize it when you are ready for it.

## Learn More

You can learn more in the [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started).

To learn React, check out the [React documentation](https://reactjs.org/).

### Code Splitting

This section has moved here: [https://facebook.github.io/create-react-app/docs/code-splitting](https://facebook.github.io/create-react-app/docs/code-splitting)

### Analyzing the Bundle Size

This section has moved here: [https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size](https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size)

### Making a Progressive Web App

This section has moved here: [https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app](https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app)

### Advanced Configuration

This section has moved here: [https://facebook.github.io/create-react-app/docs/advanced-configuration](https://facebook.github.io/create-react-app/docs/advanced-configuration)

### Deployment

This section has moved here: [https://facebook.github.io/create-react-app/docs/deployment](https://facebook.github.io/create-react-app/docs/deployment)

### `npm run build` fails to minify

This section has moved here: [https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify](https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify)
