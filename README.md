# Wear It Backend

NestJS + MongoDB API for **Wear It**, a personal virtual closet. Members photograph the clothes
they already own, store them in a private wardrobe, combine one item per clothing type into an
outfit, and generate an AI image of themselves wearing it.

```bash
cp .env.example .env
npm install
npm run start:dev
```

## Domain model

| Collection       | Purpose                                                                    |
| ---------------- | -------------------------------------------------------------------------- |
| `accounts`       | Members and admins (`role: 'user' \| 'admin'`)                              |
| `clothingtypes`  | Admin-managed wardrobe categories (T-shirt, Pants, Jacket, …)               |
| `wardrobeitems`  | One photographed garment, owned by one member, typed by one clothing type   |
| `userphotos`     | Personal photos a member reuses as the base for looks                       |
| `looks`          | A generated outfit, with a snapshot of every garment it was built from      |
| `sitecontents`   | Public marketing copy edited through the CMS                                |

## API

Everything is under the `/api` prefix.

| Method   | Route                       | Access | Notes                                             |
| -------- | --------------------------- | ------ | ------------------------------------------------- |
| `POST`   | `/auth/register`            | public | Always creates a `user`; admins are seeded        |
| `POST`   | `/auth/login`               | public | Returns the token and the real role               |
| `GET`    | `/auth/me`                  | member | Reads the account back from the database          |
| `GET`    | `/clothing-types`           | public | Active types only                                 |
| `*`      | `/clothing-types/...`       | admin  | Create, update, hide, delete                      |
| `*`      | `/wardrobe`, `/wardrobe/:id`| member | Always scoped to the caller's own items           |
| `*`      | `/photos`, `/photos/:id`    | member | Always scoped to the caller's own photos          |
| `POST`   | `/looks/generate`           | member | One item per clothing type, 1–8 items             |
| `GET`    | `/looks`, `/looks/:id`      | member | Own looks only                                    |
| `GET`    | `/looks/status`             | member | Whether the image model is configured             |
| `POST`   | `/uploads/image`            | member | PNG / JPG / WEBP up to 10 MB, from the device     |
| `POST`   | `/uploads/from-url`         | member | Imports an image from a link, stored as an upload |
| `GET`    | `/content`                  | public | Site copy                                         |
| `PATCH`  | `/content`                  | admin  | Site copy                                         |
| `GET`    | `/admin/stats`, `/admin/type-usage`, `/admin/members` | admin | Reporting     |

## Look generation

`POST /api/looks/generate` takes wardrobe item ids plus a saved photo id. The service:

1. loads the items **scoped to the signed-in member** and rejects anything they do not own;
2. rejects a second item of a clothing type already in the outfit, naming the clash;
3. orders the garments by the clothing type's `sortOrder` so base layers go on first;
4. sends the photo and every garment image to the OpenAI image edit endpoint;
5. saves the result and a snapshot of each garment, so the look survives item deletion.

Failed attempts are stored with `status: 'failed'` and the reason. A member may only have one
generation in flight at a time.

## Importing an image from a link

`POST /api/uploads/from-url` takes `{ "url": "https://…" }`, downloads the image **on the
server**, and saves it as an ordinary upload — the response is the same `/uploads/...` path a
device upload returns. Nothing downstream ever holds or fetches a member-supplied address.

The download is the only place that touches a member-chosen host, so it refuses everything
that is not a public web address:

- `http`/`https` only, no credentials in the URL, ports 80 and 443 only;
- the resolved IP is checked **at connect time**, so a name cannot pass a check and then
  resolve elsewhere; private, loopback, link-local (including `169.254.169.254`), CGNAT,
  multicast and reserved ranges are all refused, in IPv4, IPv6 and IPv4-mapped forms;
- redirects are followed manually, at most three, and every hop is re-validated;
- the response is capped at 10 MB and re-encoded with sharp, so only a genuine PNG, JPG or
  WEBP survives whatever content-type the server claimed;
- one import in flight per member.

`IMAGE_IMPORT_ALLOW_LOOPBACK=true` lifts the loopback and port rules **only**, so the
end-to-end suite can import from its own test server. Leave it off everywhere else.

## Languages

The API stays language-neutral and lets the client decide what to show.

- **Site content** is stored per language: every field in `sitecontents` is `{ ar, en }`.
  `PATCH /api/content` merges per language, so saving Arabic alone never blanks the English
  copy. Documents written before the site was bilingual hold a plain string; those are read
  as the copy for both languages until an admin edits them, so no migration script is needed.
- **Clothing types** carry `name` and `nameAr`. Both are required when creating one, so no
  new type can reach members untranslated; `nameAr` stays optional on update and falls back
  to `name` if it is ever empty.

  Databases created before Arabic names existed are repaired on startup: the seed fills in
  `nameAr` for the starter types and the Arabic label on look snapshots that predate it. It
  only ever writes where the field is empty, so an admin's own wording is never overwritten
  and it is safe on every boot. A type the admin invented gets a warning in the log rather
  than a guess — add its Arabic name in the CMS.
- **Errors** carry a stable `code` alongside their English `message`, plus `params` for the
  values a translated sentence interpolates:

  ```json
  { "statusCode": 400, "code": "ITEM_TYPE_CLASH",
    "message": "A look can only include one T-shirt. You selected 2: white tee, black tee.",
    "params": { "type": "T-shirt", "count": 2, "names": "white tee, black tee" } }
  ```

  Clients translate by code and fall back to the message. Field-validation messages from
  `class-validator` are still English.

## Privacy and storage

- Personal photos, item photos and generated looks are stored under random UUID names and
  served as unguessable capability URLs. Anyone holding a URL can fetch that file, so treat the
  paths as secrets and put the media behind signed URLs before production.
- Two storage drivers. With `IMAGEKIT_PUBLIC_KEY`, `IMAGEKIT_PRIVATE_KEY` and
  `IMAGEKIT_URL_ENDPOINT` all set, media goes to ImageKit (folder `IMAGEKIT_FOLDER`, default
  `wear-it`); otherwise it is written to `UPLOADS_DIR` (default `uploads/`). Either way the
  stored value is `/uploads/<filename>` and `GET /uploads/<filename>` answers — serving the
  file from disk, or redirecting to the CDN copy. Copy existing files across before switching:

  ```bash
  npm run media:migrate          # add -- --dry-run to see what it would upload
  ```
- Deleting a photo, item or look removes the underlying file once nothing else references it.
- Item and photo URLs must be `/uploads/...` paths produced by this API. A member can still add
  an item from a link, but the image is downloaded once by `POST /uploads/from-url` and stored
  by whichever driver is configured; a member-supplied address is never persisted or fetched later.
- Person photos are sent to the OpenAI image API at generation time.

## Testing

```bash
npm test          # unit tests for the try-on prompt and the outfit rules

# end-to-end contract check (needs a reachable MongoDB)
npm run qa:stub &                                             # fake image API on :4999
MONGODB_URI=mongodb://127.0.0.1:27017/wear_it_qa PORT=4100 \
  UPLOADS_DIR=./uploads-qa \
  OPENAI_API_KEY=stub OPENAI_BASE_URL=http://127.0.0.1:4999/v1 \
  IMAGE_IMPORT_ALLOW_LOOPBACK=true \
  node dist/main.js &
API_URL=http://localhost:4100/api npm run qa:e2e
```

Give every throwaway instance its own `UPLOADS_DIR`. A test run that clears its media
directory will otherwise delete the files of any other instance sharing it.

The seed admin defaults to `admin@wearit.local` / `WearIt123!`. Change it and `JWT_SECRET`
before deploying.
