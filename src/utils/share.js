
export const compartirFicha = async (titulo , texto , url) => {
  const datos = {title : titulo , text : texto , url : url}
  if(navigator.share && navigator.canShare(datos)){
    try{
      await navigator.share(datos)
      console.log("Contenido compartido exitosamente")
    }catch(error){
      if(error.name === "AbortError"){
        console.log("El usuario canceló el menú de compartir")
      }else{
        copiarAlPortapapeles(url)
      }
    }
  }else{
    copiarAlPortapapeles(url)
  }
}

const copiarAlPortapapeles = (texto) => {
  navigator.clipboard.writeText(texto)
    .then(() => alert("Enlace copiado al portapapeles."))
    .catch(() => alert("No se pudo copiar el enlace."));
}