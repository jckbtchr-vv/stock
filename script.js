let uploadedImage = null;
let variants = [];

// Seeded random number generator
function seededRandom(seed) {
    let state = seed;
    return () => {
        state |= 0;
        state = state + 0x6D2B79F5 | 0;
        let t = Math.imul(state ^ state >>> 15, 1 | state);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

// Generate random color palette
function generateColorPalette(numColors, rng) {
    const colors = [];
    const baseHue = rng() * 360;
    
    for (let i = 0; i < numColors; i++) {
        const hue = (baseHue + (i * 360 / numColors)) % 360;
        const saturation = 70 + rng() * 30;
        const lightness = 40 + rng() * 40;
        
        const h = hue / 360;
        const s = saturation / 100;
        const l = lightness / 100;
        
        const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1/6) return p + (q - p) * 6 * t;
            if (t < 1/2) return q;
            if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
            return p;
        };
        
        let r, g, b;
        if (s === 0) {
            r = g = b = l;
        } else {
            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;
            r = hue2rgb(p, q, h + 1/3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1/3);
        }
        
        colors.push([
            Math.round(r * 255),
            Math.round(g * 255),
            Math.round(b * 255)
        ]);
    }
    return colors;
}

// Apply Sierra dithering
function applyDithering(imageData, palette, contrast) {
    const data = new Uint8ClampedArray(imageData.data);
    const width = imageData.width;
    const height = imageData.height;

    const adjustContrast = (value) => {
        return Math.max(0, Math.min(255, ((value - 128) * contrast) + 128));
    };

    const findClosestColor = (r, g, b) => {
        let minDist = Infinity;
        let closest = palette[0];
        for (const color of palette) {
            const dist = Math.sqrt(
                Math.pow(r - color[0], 2) +
                Math.pow(g - color[1], 2) +
                Math.pow(b - color[2], 2)
            );
            if (dist < minDist) {
                minDist = dist;
                closest = color;
            }
        }
        return closest;
    };

    const distributeError = (x, y, errR, errG, errB) => {
        const matrix = [
            [1, 0, 5/32], [2, 0, 3/32], [-2, 1, 2/32], [-1, 1, 4/32],
            [0, 1, 5/32], [1, 1, 4/32], [2, 1, 2/32], [-1, 2, 2/32],
            [0, 2, 3/32], [1, 2, 2/32]
        ];
        
        for (const [dx, dy, factor] of matrix) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                const idx = (ny * width + nx) * 4;
                data[idx] = Math.max(0, Math.min(255, data[idx] + errR * factor));
                data[idx + 1] = Math.max(0, Math.min(255, data[idx + 1] + errG * factor));
                data[idx + 2] = Math.max(0, Math.min(255, data[idx + 2] + errB * factor));
            }
        }
    };

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            let r = adjustContrast(data[idx]);
            let g = adjustContrast(data[idx + 1]);
            let b = adjustContrast(data[idx + 2]);

            const closest = findClosestColor(r, g, b);
            const errR = r - closest[0];
            const errG = g - closest[1];
            const errB = b - closest[2];
            
            data[idx] = closest[0];
            data[idx + 1] = closest[1];
            data[idx + 2] = closest[2];

            distributeError(x, y, errR, errG, errB);
        }
    }

    return new ImageData(data, width, height);
}

// Generate variants
async function generateVariants() {
    if (!uploadedImage) return;

    console.log('=== STARTING GENERATION ===');
    const useTiling = document.getElementById('useTiling').checked;
    const numVariants = parseInt(document.getElementById('numVariants').value);
    const seedText = document.getElementById('seed').value;
    
    console.log('useTiling:', useTiling);
    console.log('numVariants:', numVariants);

    document.getElementById('generateBtn').disabled = true;
    document.getElementById('progressBar').classList.remove('hidden');
    variants = [];

    const seedValue = seedText ? seedText.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) : Date.now();
    const rng = seededRandom(seedValue);

    const img = new Image();
    img.src = uploadedImage;
    await new Promise(resolve => { img.onload = resolve; });
    
    console.log('Image loaded:', img.width, 'x', img.height);

    if (useTiling) {
        console.log('=== ENTERING TILING MODE ===');
        
        for (let variantIdx = 0; variantIdx < numVariants; variantIdx++) {
            const gridCanvas = document.createElement('canvas');
            gridCanvas.width = img.width * 2;
            gridCanvas.height = img.height * 2;
            const gridCtx = gridCanvas.getContext('2d');
            
            console.log(`Creating 2x2 grid ${variantIdx + 1}: ${gridCanvas.width}x${gridCanvas.height}`);

            // Generate 4 different dithered tiles
            for (let tileIdx = 0; tileIdx < 4; tileIdx++) {
                const numColors = 2 + Math.floor(rng() * 7);
                const paletteColors = generateColorPalette(numColors, rng);
                const contrast = 0.6 + rng() * 1.6;

                const tileCanvas = document.createElement('canvas');
                tileCanvas.width = img.width;
                tileCanvas.height = img.height;
                const tileCtx = tileCanvas.getContext('2d');
                
                tileCtx.drawImage(img, 0, 0);
                const imageData = tileCtx.getImageData(0, 0, img.width, img.height);
                const dithered = applyDithering(imageData, paletteColors, contrast);
                tileCtx.putImageData(dithered, 0, 0);

                const x = (tileIdx % 2) * img.width;
                const y = Math.floor(tileIdx / 2) * img.height;
                console.log(`Drawing tile ${tileIdx} at (${x}, ${y})`);
                gridCtx.drawImage(tileCanvas, x, y);
            }

            variants.push({
                id: variantIdx + 1,
                dataUrl: gridCanvas.toDataURL(),
                tiled: true,
                dimensions: `${gridCanvas.width}x${gridCanvas.height}`
            });

            const progress = ((variantIdx + 1) / numVariants) * 100;
            document.getElementById('progress').style.width = `${progress}%`;
            await new Promise(resolve => setTimeout(resolve, 0));
        }
    } else {
        console.log('=== ENTERING SINGLE IMAGE MODE ===');
        
        for (let i = 0; i < numVariants; i++) {
            const numColors = 2 + Math.floor(rng() * 7);
            const paletteColors = generateColorPalette(numColors, rng);
            const contrast = 0.6 + rng() * 1.6;

            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            
            ctx.drawImage(img, 0, 0);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const dithered = applyDithering(imageData, paletteColors, contrast);
            ctx.putImageData(dithered, 0, 0);

            variants.push({
                id: i + 1,
                dataUrl: canvas.toDataURL(),
                tiled: false
            });

            const progress = ((i + 1) / numVariants) * 100;
            document.getElementById('progress').style.width = `${progress}%`;
            await new Promise(resolve => setTimeout(resolve, 0));
        }
    }

    displayVariants();
    document.getElementById('generateBtn').disabled = false;
    document.getElementById('progressBar').classList.add('hidden');
}

function displayVariants() {
    const grid = document.getElementById('variantsGrid');
    grid.innerHTML = '';
    document.getElementById('variantCount').textContent = variants.length;
    document.getElementById('results').classList.remove('hidden');

    variants.forEach(variant => {
        const div = document.createElement('div');
        div.className = 'bg-slate-800/50 rounded-lg overflow-hidden border border-purple-500/20';
        div.innerHTML = `
            <img src="${variant.dataUrl}" class="w-full object-contain bg-slate-900">
            <div class="p-3">
                <div class="text-xs text-gray-300 mb-2">
                    <span class="font-mono">#${variant.id}</span>
                    ${variant.tiled ? '<span class="ml-2 text-purple-400 font-bold">2x2 GRID</span>' : ''}
                </div>
                ${variant.dimensions ? `<div class="text-xs text-gray-400">${variant.dimensions}</div>` : ''}
                <button onclick="downloadVariant(${variant.id})" class="w-full mt-2 px-3 py-1.5 bg-purple-600/50 hover:bg-purple-600 rounded text-xs transition">
                    Download
                </button>
            </div>
        `;
        grid.appendChild(div);
    });
}

function downloadVariant(id) {
    const variant = variants.find(v => v.id === id);
    const link = document.createElement('a');
    link.download = `dither-variant-${id}.png`;
    link.href = variant.dataUrl;
    link.click();
}

// Event listeners
document.getElementById('uploadBtn').addEventListener('click', () => {
    document.getElementById('imageUpload').click();
});

document.getElementById('imageUpload').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            uploadedImage = e.target.result;
            document.getElementById('preview').src = uploadedImage;
            document.getElementById('preview').classList.remove('hidden');
            document.getElementById('controls').classList.remove('hidden');
        };
        reader.readAsDataURL(file);
    }
});

document.getElementById('numVariants').addEventListener('input', (e) => {
    document.getElementById('numVariantsValue').textContent = e.target.value;
});

document.getElementById('generateBtn').addEventListener('click', generateVariants);

document.getElementById('downloadMetadata').addEventListener('click', () => {
    const metadata = variants.map(v => ({
        id: v.id,
        tiled: v.tiled,
        dimensions: v.dimensions
    }));
    const blob = new Blob([JSON.stringify(metadata, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.download = 'variants-metadata.json';
    link.href = URL.createObjectURL(blob);
    link.click();
});
