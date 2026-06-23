# Tour 360

A small local web app for exploring tourist places with Google Maps embeds and no paid API key.

## What it does

- Shows a searchable list of tourist places.
- Opens a 360-degree Google Street View style embed for the selected place.
- Switches to a normal map preview.
- Provides direct buttons to open the same place in Google Maps or Street View.
- Includes a Room Photos setup screen where you can upload 20-30 local room images, review photo coverage, and preview the uploaded image set.

## Run it

```powershell
npm install
npm run dev -- --port 5173
```

In a second PowerShell window, start the local stitching API:

```powershell
npm run api
```

Then open:

```text
http://127.0.0.1:5173
```

## Important limitation

This app intentionally avoids Google Maps Platform API keys and billing. It uses public Google Maps embed URL formats, so it costs nothing, but it is not as controllable as the official Google Maps JavaScript API.

If you later want production-level search, autocomplete, place IDs, Street View panorama control, or guaranteed API behavior, you will need an official Google Maps Platform key and billing setup.

The Room Photos screen sends uploaded images to a local Python/OpenCV stitcher and loads the result in a Pannellum 360 viewer. This is free and local. It is not cloud AI training, and it is not a walkable Gaussian Splatting model. If the images do not overlap cleanly, stitching can fail.
