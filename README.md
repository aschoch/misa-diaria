# Misa diaria

Grupo privado de doce personas. La página es pública; los datos, no.

La guía para publicar está en [docs/puesta-en-marcha.md](docs/puesta-en-marcha.md). Lo que se decidió está en [docs/decisiones.md](docs/decisiones.md).

En local, con Docker: `supabase start`. Sin Docker, las reglas de la base se prueban con Postgres. La aplicación se abre con Vite:

```bash
npm install
npm run test:db
npm run test:aviso
npm run test:e2e
npm run dev
npm run build
```
