# MOTION VJ AI
### Instrumento audiovisual con inteligencia artificial

Usa **MediaPipe Pose Landmarker** para detectar 33 puntos de tu esqueleto en tiempo real y convertir tu cuerpo en un instrumento musical y controlador visual.

## Instalación

```bash
# 1. Instalar dependencias (incluye MediaPipe AI)
npm install

# 2. Iniciar
npm run dev

# 3. Abrir en Chrome
# → http://localhost:5173
```

## Mapa de gestos

### Mano derecha → Música
| Gesto | Acción |
|-------|--------|
| Altura de la mano | Selecciona nota (arriba=agudo, abajo=grave) |
| Movimiento rápido | Pluck / percusión |
| Sobre el hombro | Activa voz Lead |
| Manos muy separadas | Inicia arpegiador |

### Mano izquierda → Efectos visuales
| Altura | Efecto |
|--------|--------|
| Sobre la cabeza | Strobe |
| Nivel de ojos | Hue Rotate |
| Nivel de pecho | Glitch |
| Nivel de cadera | Blur |
| Abajo | Pixelate |
| Brazo extendido izq | Línea de bajo |

### Cuerpo completo
| Gesto | Acción |
|-------|--------|
| Ambas manos arriba | Acorde pad + bells |
| Aplaudir | Flash de transición |
| Sentadilla | Sub bass drone |
| Inclinación izq/der | Crossfader |
| Brazos cruzados (2s) | STOP todo |

### Brazos → Vídeos
| Gesto | Vídeo |
|-------|-------|
| Brazo izquierdo extendido | Vídeo A |
| Brazo derecho extendido | Vídeo B |
| Ambos brazos arriba | Vídeo C |
| Sentadilla | Vídeo D |

## Requisitos
- Node.js 18+
- Chrome (mejor soporte GPU para MediaPipe)
- Webcam
- Conexión a internet (primera vez, para descargar modelo ~4MB)
