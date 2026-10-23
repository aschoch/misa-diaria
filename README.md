# Misa diaria

Grupo privado de doce personas. La página es pública; los datos, no.

La guía para publicar está en [docs/puesta-en-marcha.md](docs/puesta-en-marcha.md). Lo que se decidió está en [docs/decisiones.md](docs/decisiones.md).

En local, con Docker: `supabase start`. Sin Docker, las reglas de la base se prueban con Postgres:

```bash
npm install
npm run test:db
```
