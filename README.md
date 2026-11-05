# Baluarte de San Ignacio â€” visor 3D

Visor web interactivo (three.js) del modelo Revit de la propuesta de concurso en el Baluarte de San Ignacio, Cartagena de Indias.

- `index.html`, `app.js`, `style.css`: aplicaciÃ³n.
- `assets/modelo.glb`: geometrÃ­a exportada del modelo Revit (metros, +Y arriba, norte del proyecto = âˆ’Z), comprimida con meshopt.
- `assets/elements.json`: datos de cada elemento (nombre, categorÃ­a, tipo, nivel, fase, comentarios, ID de Revit, caja envolvente).
- `assets/tex/`: texturas PBR.

## Controles
Ã“rbita: arrastrar rota, rueda zoom, clic derecho desplaza, doble clic pivota. Recorrido: W A S D / flechas, MayÃºs corre. Teclas 1â€“6: vistas.

## CrÃ©ditos
- Texturas CC0: [ambientCG](https://ambientcg.com) (Grass004, Asphalt026C, Plaster001, Bricks096, Wood049, RoofingTiles006, PavingStones070) y [3dtextures.me](https://3dtextures.me) (Cobblestone Irregular Floor 001, Terracotta Floor Tiles 009).
- VegetaciÃ³n: impostores horneados desde modelos escaneados CC0 de [Poly Haven](https://polyhaven.com) (Jacaranda Tree, Island Tree 02) y una palma real modelada; cada Ã¡rbol se coloca en la posiciÃ³n y altura del ejemplar RPC del modelo Revit.
- [three.js](https://threejs.org) (MIT) y [three-mesh-bvh](https://github.com/gkjohnson/three-mesh-bvh) (MIT), cargados desde jsDelivr.
- Cielo: HDRI CC0 [Kloofendal 48d Partly Cloudy (Pure Sky)](https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky) de Poly Haven.
