# VolumeVault21
## Self hosted note taking app
<img width="1255" height="799" alt="Captura de pantalla 2025-12-05 a la(s) 1 10 00 p m" src="https://github.com/user-attachments/assets/830755f1-7de2-45a2-ad8d-a4809346a38c" />

# Docker Compose
```
name: volumevault21
services:
  app:
    image: volumedata21/volumevault21:latest
    container_name: volumevault21
    ports:
      - "2100:2100"
    volumes:
      - ./data:/data
    restart: unless-stopped
    user: 1000:1000
```
