import Router from "./router/router.js";
import HomeView from "./views/HomeView.js";
import AboutView from "./views/AboutView.js";
import ContactView from "./views/ContactView.js";

// Definimos el "mapa de rutas" de la aplicación. Nota que HomeView y
// AboutView se importaron de forma ESTÁTICA arriba (se descargan siempre,
// al inicio), mientras que ContactView, adentro de su propio archivo, hace
// un import DINÁMICO de ApiService (se descarga solo cuando se necesita).
const routes = [
  { path: "/", view: HomeView },
  { path: "/acerca", view: AboutView },
  { path: "/contacto", view: ContactView },
];

const app = document.getElementById("app");
const router = new Router(routes, app);

router.init();
