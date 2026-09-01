/**
 * Router — enrutador de cliente basado en la History API.
 *
 * Estado actual: SOLO soporta rutas EXACTAS (route.path === path).
 * TODO (Ejercicio - Parte A, punto 1): agrega soporte para rutas con
 * parámetros, como "/item/:id", dentro de matchRoute().
 */
export default class Router {
  constructor(routes, rootElement) {
    this.routes = routes;
    this.root = rootElement;

    window.addEventListener("popstate", () => this.render());

    document.addEventListener("click", (event) => {
      const link = event.target.closest("[data-link]");
      if (!link) return;
      event.preventDefault();
      this.navigate(link.getAttribute("href"));
    });
  }

  navigate(path) {
    window.history.pushState({}, "", path);
    this.render();
  }

  /**
   * Debe devolver { route, params } si alguna ruta coincide con "path",
   * o null si ninguna coincide.
   *
   * Ahora mismo SOLO compara de forma exacta, por lo que "/item/1" no
   * hace match con la ruta definida como "/item/:id".
   *
   * TODO: soporta segmentos dinámicos (":id") y regresa también los
   * parámetros capturados, ej:
   *   matchRoute("/item/2") -> { route: <ruta /item/:id>, params: { id: "2" } }
   */
  matchRoute(path) {
    for (const route of this.routes) {
      if (route.path === path) {
        return { route, params: {} };
      }

      const routeSegments = route.path.split("/");
      const pathSegments = path.split("/");

      if (routeSegments.length !== pathSegments.length) {
        continue;
      }

      let isMatch = true;
      const params = {};

      for (let i = 0; i < routeSegments.length; i++) {
        const routeSeg = routeSegments[i];
        const pathSeg = pathSegments[i];

        if (routeSeg.startsWith(":")) {
          const paramName = routeSeg.slice(1);
          params[paramName] = decodeURIComponent(pathSeg);
        } else if (routeSeg !== pathSeg) {
          isMatch = false;
          break;
        }
      }

      if (isMatch) {
        return { route, params };
      }
    }

    return null;
  }

  async render() {
    const path = window.location.pathname;
    const match = this.matchRoute(path);

    // muestra el skeleton mientras el router resuelve la vista
    this.root.innerHTML = `
      <div class="skeleton-loader" aria-label="Cargando contenido…" role="status">
        <div class="skeleton-block title"></div>
        <div class="skeleton-block card"></div>
        <div class="skeleton-block card"></div>
        <div class="skeleton-block card"></div>
      </div>
    `;

    // Pausa de 2 segundos para poder ver el skeleton loader
    await new Promise((resolve) => setTimeout(resolve, 1000));

    if (!match) {
      const { default: NotFoundView } = await import(
        "../views/NotFoundView.js"
      );
      this.root.innerHTML = NotFoundView();
      return;
    }

    const html = await match.route.view(match.params);
    this.root.innerHTML = html;
    document.title = `Birdify — ${path === "/" ? "Inicio" : path}`;
  }

  init() {
    this.render();
  }
}
