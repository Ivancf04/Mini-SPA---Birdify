import Router from "./router/router.js";
import HomeView from "./views/HomeView.js";
import AboutView from "./views/AboutView.js";
import ItemDetailView from "./views/ItemDetailView.js";

// La ruta "/item/:id" ya está registrada aquí, pero el Router todavía
// no sabe hacer match con rutas dinámicas (ver TODO en router.js).
//
// TODO: si renombraste tu entidad (ej. "receta"), puedes
// cambiar aquí el path a algo como "/receta/:id" — solo asegúrate de
// que coincida con los enlaces generados en ItemCard.js.
const routes = [
  { path: "/index.html", view: HomeView }, // Para que funcione al abrir el index.html directamente, porque sin eso siempre se muestra la vista de not found al abrir el archivo en live server.
  { path: "/", view: HomeView },
  { path: "/acerca", view: AboutView },
  { path: "/item/:id", view: ItemDetailView },
];

const app = document.getElementById("app");
const router = new Router(routes, app);

router.init();
