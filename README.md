# Plumbline demo for Trifecta Builders

A clickable demo of Plumbline, a job-cost-first platform for custom home builders. It runs on a sample coastal job and covers:

- **Plans to 3D and takeoff**: a floor plan, a furnished 3D walkthrough built from that plan, and an editable material takeoff from the same geometry
- Homeowner app (selections, change orders), job costing, schedule, client inbox, field app and owner dashboard

All data is sample data. Nothing is stored or sent anywhere.

## Deploy on Vercel

1. In Vercel, choose **Add New → Project** and import this GitHub repository.
2. If this folder is not the repository root, set **Root Directory** to the folder that contains this README.
3. Framework, build command and output folder are read from `vercel.json` (Vite, `npm run build`, `dist`).
4. Under **Environment Variables**, add `ACCESS_CODE` with the code you will give Trifecta. Codes are not case-sensitive.
5. Deploy. Visitors see a code screen first; the code is remembered on that device for 30 days.

To change the code later, edit `ACCESS_CODE` and redeploy. Everyone will need the new code.

## Run locally

```bash
npm install
npm run dev
```

The access-code screen only runs on Vercel (it is Vercel Routing Middleware in `middleware.js`), so local runs open straight to the demo.

## How the 3D walkthrough works

- `src/plan.js` holds the plan geometry in feet: rooms, walls and openings. The 2D plan, the 3D house and the takeoff all read from it.
- `src/viewer/viewer.js` builds walls, lap siding, trim, windows, doors, cabinets and ceilings from the plan, places furniture, and renders with image-based daylight, window shadows and ambient occlusion. **Take a photo** re-renders the view at high resolution for saving.
- `src/viewer/textures.js` draws wood plank, tile, siding, quartz, rug and lawn textures in the browser, so there are no texture downloads.
- Furniture models are in `public/models`, compressed to keep the first load near 6 MB.

## Credits

3D furniture from the [Khronos glTF Sample Assets](https://github.com/KhronosGroup/glTF-Sample-Assets):

- Glam Velvet Sofa and Anisotropy Barn Lamp by Eric Chadwick, © Wayfair, CC BY 4.0
- Sheen Wood Leather Sofa and Diffuse Transmission Plant by Eric Chadwick (Darmstadt Graphics Group), CC BY 4.0, from CC0 originals by Fran Calvente and Rico Cilliers
- Sheen Chair by Eric Chadwick, © Wayfair, CC0

Sky lighting: Forest Slope from [Poly Haven](https://polyhaven.com), CC0. Rendering: [three.js](https://threejs.org) and [N8AO](https://github.com/N8python/n8ao).
