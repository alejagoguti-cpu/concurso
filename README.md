# Baluarte de San Ignacio — visor 3D

Visor web interactivo (three.js) del modelo Revit de la propuesta de concurso en el Baluarte de San Ignacio, Cartagena de Indias.

- `index.html`, `app.js`, `style.css`: aplicación.
- `assets/modelo.glb`: zona de detalle (baluarte, Museo Naval, pabellón, rampa) exportada del modelo Revit (metros, +Y arriba, norte del proyecto = −Z), comprimida con meshopt.
- `assets/contexto.glb`: resto del contexto de Cartagena del mismo modelo Revit; se carga después de la zona de detalle.
- `assets/elements.json`, `assets/elements_ctx.json`: datos de cada elemento (nombre, categoría, tipo, nivel, fase, comentarios, ID de Revit, caja envolvente).
- `assets/tex/`, `assets/veg/`, `assets/sky/`: texturas PBR, atlas de vegetación y cielo HDRI.

## Controles
Órbita: arrastrar rota, rueda zoom, clic derecho desplaza, doble clic pivota. Recorrido: W A S D / flechas, Mayús corre. Teclas 1–6: vistas.
Si el equipo tiene poca memoria gráfica, el visor pasa solo a calidad media (también con `?medio` en la URL).

## Créditos
- Texturas CC0: [ambientCG](https://ambientcg.com) (Grass004, Asphalt026C, Plaster001, Bricks096, Wood049, RoofingTiles006, PavingStones070) y [3dtextures.me](https://3dtextures.me) (Cobblestone Irregular Floor 001, Terracotta Floor Tiles 009).
- Vegetación: impostores horneados desde modelos escaneados CC0 de [Poly Haven](https://polyhaven.com) (Jacaranda Tree, Island Tree 02) y una palma real modelada; cada árbol se coloca en la posición y altura del ejemplar RPC del modelo Revit.
- Cielo: HDRI CC0 [Kloofendal 48d Partly Cloudy (Pure Sky)](https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky) de Poly Haven.
- [three.js](https://threejs.org) (MIT) y [three-mesh-bvh](https://github.com/gkjohnson/three-mesh-bvh) (MIT), cargados desde jsDelivr.
