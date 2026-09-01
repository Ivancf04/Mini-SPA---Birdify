import Router from "./router/router.js";
import HomeView from "./views/HomeView.js";
import AboutView from "./views/AboutView.js";
import ItemDetailView from "./views/ItemDetailView.js";

const routes = [
  { path: "/index.html", view: HomeView }, // Para funcionamiento directo en Live Server
  { path: "/", view: HomeView },
  { path: "/acerca", view: AboutView },
  { path: "/item/:id", view: ItemDetailView },
];

const app = document.getElementById("app");
const router = new Router(routes, app);

router.init();
