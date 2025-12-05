# VolumeVault21
### Self hosted note taking app
<img width="1255" height="799" alt="Captura de pantalla 2025-12-05 a la(s) 1 10 00 p m" src="https://github.com/user-attachments/assets/830755f1-7de2-45a2-ad8d-a4809346a38c" />

## Docker Compose
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

## About VolumeVault21
¡Bienvenido! VolumeVault21 is my attempt at a self-hosted note-taking app. It should work as a PWA app if you'd like to install it on your Android device. I recommend setting it up with a reverse proxy if possible. You could even use something like Nginx Proxy Manger to create a mandatory login (I think?). 

## AI Warning
This app was created with the help of AI and my very loose coding/Github/Visual Studio Code knowledge. I am a hobbyist coder. I've created a few websites from scratch with HTML/CSS in the past. I'm learning more typescript as I try to create more apps, but if you have any worry about AI code generation you have the full code here in Github for your own review.
