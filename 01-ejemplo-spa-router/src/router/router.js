/**
 * Router — enrutador de cliente basado en la History API.
 *
 * routes: Array<{ path: string, view: Function }>
 *   - path: ruta exacta, ej. "/", "/acerca"
 *   - view: función (sync o async) que devuelve el HTML a renderizar
 */
export default class Router {
  constructor(routes, rootElement) {
    this.routes = routes;
    this.root = rootElement;

    // 1) Escuchar el evento "popstate": se dispara cuando el usuario usa
    //    los botones Atrás / Adelante del navegador.
    window.addEventListener("popstate", () => this.render());

    // 2) Interceptar clics en cualquier <a data-link> para evitar que el
    //    navegador haga una petición HTTP completa (recarga de página).
    document.addEventListener("click", (event) => {
      const link = event.target.closest("[data-link]");
      if (!link) return;
      event.preventDefault();
      this.navigate(link.getAttribute("href"));
    });
  }

  /**
   * Cambia de ruta de forma programática (equivalente a lo que hace
   * useNavigate()/history.push() en librerías como React Router).
   */
  navigate(path) {
    // pushState NO recarga el documento; solo actualiza la barra de
    // direcciones y crea una entrada nueva en el historial.
    window.history.pushState({}, "", path);
    this.render();
  }

  /**
   * Busca la ruta que coincide con location.pathname y renderiza su vista
   * dentro del elemento raíz. Si no hay coincidencia, cae en un 404.
   */
  async render() {
    const path = window.location.pathname;
    const match = this.routes.find((route) => route.path === path);

    if (!match) {
      const { default: NotFoundView } = await import(
        "../views/NotFoundView.js"
      );
      this.root.innerHTML = NotFoundView();
      return;
    }

    // Soporta tanto vistas síncronas (HomeView) como asíncronas
    // (ContactView, que hace un import dinámico + fetch dentro de sí misma).
    const html = await match.view();
    this.root.innerHTML = html;

    // Aquí se podría actualizar el título del documento, marcar el link
    // activo en la navegación, hacer scroll al top, etc.
    document.title = `Demo SPA — ${path === "/" ? "Inicio" : path.slice(1)}`;
  }

  /** Debe llamarse una vez, al cargar la aplicación. */
  init() {
    this.render();
  }
}
