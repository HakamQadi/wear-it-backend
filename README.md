# Wear It Backend

NestJS + MongoDB API for Wear It.

```bash
cp .env.example .env
npm install
npm run start:dev
```

Local seed admin defaults to `admin@wearit.local` / `WearIt123!`. Change credentials and `JWT_SECRET` before production.

AI virtual try-on uses the OpenAI Image API. Set `OPENAI_API_KEY` in `.env`; `OPENAI_IMAGE_MODEL` defaults to `gpt-image-2`. Person photos are processed in memory and are not saved by Wear It. Generated results are written to `uploads/`.
