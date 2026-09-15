FROM node:20-slim

# Pandoc dipakai untuk mengonversi .docx (termasuk equation OMML Word)
# menjadi Markdown dengan rumus matematika otomatis jadi LaTeX ($...$ / $$...$$)
RUN apt-get update \
    && apt-get install -y --no-install-recommends pandoc \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.js"]
