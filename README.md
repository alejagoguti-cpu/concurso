# Baluarte de San Ignacio — visor 3D

Visor web interactivo (three.js) del modelo Revit de la propuesta de concurso en el Baluarte de San Ignacio, Cartagena de Indias.

- `index.html`, `app.js`, `style.css`: aplicación.
- `assets/modelo.glb`: geometría exportada del modelo Revit (metros, +Y arriba, norte del proyecto = −Z), comprimida con meshopt.
- `assets/elements.json`: datos de cada elemento (nombre, categoría, tipo, nivel, fase, comentarios, ID de Revit, caja envolvente).
- `assets/tex/`: texturas PBR.

## Controles
Órbita: arrastrar rota, rueda zoom, clic derecho desplaza, doble clic pivota. Recorrido: W A S D / flechas, Mayús corre. Teclas 1–6: vistas.

## Créditos
- Texturas CC0: [ambientCG](https://ambientcg.com) (Grass004, Asphalt026C, Plaster001, Rock035, Wood049, RoofingTiles006, PavingStones070) y [3dtextures.me](https://3dtextures.me) (Cobblestone Irregular Floor 001, Terracotta Floor Tiles 009).
- [three.js](https://threejs.org) (MIT) y [three-mesh-bvh](https://github.com/gkjohnson/three-mesh-bvh) (MIT), cargados desde jsDelivr.
- Árboles: representación 3D generada en el visor en la posición y tamaño de cada ejemplar RPC del modelo Revit.
