
export const obtenerUbicacion = () => {
    return new Promise((resolve , reject ) => {
        if(!("geolocation" in navigator)){
            return reject(new Error("Geolocalización no soportada en el dispositivo"))
        }
        const opciones = {enableHighAccuracy: true , timeout: 10000 , maximumAge : 0}

        navigator.geolocation.getCurrentPosition(
            (position) => resolve({lat: position.coords.latitude , lng: position.coords.longitude}),
            (error) => {
                const mensajesError = {
                    1: "Permiso Denegado. Activa la ubicación en tu navegador.",
                    2: "Ubicación no permitida.",
                    3: "Tiempo de espera agotado al buscar la ubicación."
                }
                reject(new Error(mensajesError[error.code] || "Error Desconocido"))
            },
            opciones
        )
    })
}