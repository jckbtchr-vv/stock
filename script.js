let uploadedImage = null;
let variants = [];

// Theme Definitions
const THEMES = {
    NOIR: {
        name: 'Noir',
        weight: 0.4,
        palette: { minColors: 2, maxColors: 4, saturation: 0 },
        contrast: { min: 1.2, max: 2.0 }
    },
    VAPOR: {
        name: 'Vapor',
        weight: 0.3,
        palette: { minColors: 3, maxColors: 5, minHue: 150, maxHue: 320, minSat: 60, maxSat: 100 },
        contrast: { min: 0.8, max: 1.2 }
    },
    GLITCH: {
        name: 'Glitch',
        weight: 0.2,
        palette: { minColors: 2, maxColors: 2, minSat: 90, maxSat: 100, highContrast: true },
        contrast: { min: 1.5, max: 2.5 }
    },
    VOID: {
        name: 'Void',
        weight: 0.1,
        palette: { minColors: 8, maxColors: 12, maxLight: 30 },
        contrast: { min: 0.4, max: 0.7 }
    }
};

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

// Weighted Theme Selector
function selectTheme(rng) {
    const roll = rng();
    let accumulatedWeight = 0;
    
    for (const key in THEMES) {
        accumulatedWeight += THEMES[key].weight;
        if (roll <= accumulatedWeight) {
            return THEMES[key];
        }
    }
    return THEMES.NOIR; // Fallback
}

// Helper to get color name from hue
function getHueName(hue) {
    if (hue >= 345 || hue < 15) return 'Red';
    if (hue >= 15 && hue < 45) return 'Orange';
    if (hue >= 45 && hue < 75) return 'Yellow';
    if (hue >= 75 && hue < 150) return 'Green';
    if (hue >= 150 && hue < 190) return 'Cyan';
    if (hue >= 190 && hue < 270) return 'Blue';
    if (hue >= 270 && hue < 315) return 'Purple';
    if (hue >= 315 && hue < 345) return 'Pink';
    return 'Unknown';
}

// Generate theme-aware color palette
function generateColorPalette(theme, rng) {
    const colors = [];
    const settings = theme.palette;
    const numColors = Math.floor(settings.minColors + rng() * (settings.maxColors - settings.minColors + 1));
    
    // Determine base hue based on theme
    let baseHue;
    if (settings.minHue !== undefined && settings.maxHue !== undefined) {
        baseHue = settings.minHue + rng() * (settings.maxHue - settings.minHue);
    } else {
        baseHue = rng() * 360;
    }

    const hueName = getHueName(baseHue);
    
    for (let i = 0; i < numColors; i++) {
        let hue;
        if (settings.highContrast) {
            // Complementary hues for high contrast
            hue = (baseHue + (i * 180)) % 360;
        } else {
            hue = (baseHue + (i * 360 / numColors)) % 360;
        }

        // Saturation logic
        let saturation;
        if (settings.saturation !== undefined) {
            saturation = settings.saturation;
        } else if (settings.minSat !== undefined && settings.maxSat !== undefined) {
            saturation = settings.minSat + rng() * (settings.maxSat - settings.minSat);
        } else {
            saturation = 70 + rng() * 30; // Default
        }

        // Lightness logic
        let lightness;
        if (settings.maxLight !== undefined) {
            lightness = 10 + rng() * (settings.maxLight - 10);
        } else {
            lightness = 40 + rng() * 40; // Default
        }
        
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
    return { colors, hueName, numColors };
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

            // Select a theme for this variant
            const theme = selectTheme(rng);
            console.log(`Variant ${variantIdx + 1} Theme: ${theme.name}`);

            // Generate 4 different dithered tiles
            const tileTraits = [];
            for (let tileIdx = 0; tileIdx < 4; tileIdx++) {
                const { colors: paletteColors, hueName, numColors } = generateColorPalette(theme, rng);
                const contrast = theme.contrast.min + rng() * (theme.contrast.max - theme.contrast.min);

                tileTraits.push({ numColors, hueName, contrast: contrast.toFixed(2) });

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

            // For tiled, we use the average/combined traits or just primary
            variants.push({
                id: variantIdx + 1,
                dataUrl: gridCanvas.toDataURL(),
                tiled: true,
                dimensions: `${gridCanvas.width}x${gridCanvas.height}`,
                theme: theme.name,
                traits: {
                    'Theme': theme.name,
                    'Palette Type': tileTraits[0].hueName, // Dominant hue
                    'Palette Size': tileTraits.map(t => t.numColors).join(', '),
                    'Contrast': tileTraits.map(t => t.contrast).join(', ')
                }
            });

            const progress = ((variantIdx + 1) / numVariants) * 100;
            document.getElementById('progress').style.width = `${progress}%`;
            await new Promise(resolve => setTimeout(resolve, 0));
        }
    } else {
        console.log('=== ENTERING SINGLE IMAGE MODE ===');
        
        for (let i = 0; i < numVariants; i++) {
            // Select a theme for this variant
            const theme = selectTheme(rng);
            const { colors: paletteColors, hueName, numColors } = generateColorPalette(theme, rng);
            const contrast = theme.contrast.min + rng() * (theme.contrast.max - theme.contrast.min);

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
                tiled: false,
                theme: theme.name,
                traits: {
                    'Theme': theme.name,
                    'Palette Type': hueName,
                    'Palette Size': numColors,
                    'Contrast': contrast.toFixed(2)
                }
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
        div.className = 'card group bg-[#0a0a0a] border border-[#333] hover:border-[#666] transition-colors rounded-xl overflow-hidden';
        
        // Theme color badge logic
        let badgeColor = 'bg-gray-800 text-gray-300';
        if (variant.theme === 'Vapor') badgeColor = 'bg-pink-900/50 text-pink-200 border border-pink-500/30';
        if (variant.theme === 'Glitch') badgeColor = 'bg-green-900/50 text-green-200 border border-green-500/30';
        if (variant.theme === 'Void') badgeColor = 'bg-slate-900 text-slate-400 border border-slate-700';
        if (variant.theme === 'Noir') badgeColor = 'bg-zinc-800 text-zinc-300 border border-zinc-600';

        div.innerHTML = `
            <div class="aspect-square w-full bg-[#111] border-b border-[#333] p-4 flex items-center justify-center">
                <img src="${variant.dataUrl}" class="max-w-full max-h-full object-contain shadow-lg">
            </div>
            <div class="p-4">
                <div class="flex justify-between items-start mb-3">
                    <div>
                        <span class="font-mono text-xs text-gray-500 block mb-1">#${variant.id}</span>
                        <div class="text-xs font-medium px-2 py-0.5 rounded-full inline-block ${badgeColor}">
                            ${variant.theme.toUpperCase()}
                        </div>
                    </div>
                </div>
                ${variant.dimensions ? `<div class="text-[10px] text-gray-600 font-mono mb-4">${variant.dimensions}</div>` : ''}
                <button onclick="downloadVariant(${variant.id})" class="w-full py-2 text-xs font-medium border border-[#333] rounded hover:bg-white hover:text-black hover:border-white transition-all">
                    Download PNG
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

async function exportCollection() {
    if (variants.length === 0) return;

    const collectionName = document.getElementById('collectionName').value || 'Dither Collection';
    const collectionDescription = document.getElementById('collectionDescription').value || '';
    const exportBtn = document.getElementById('exportCollection');
    
    // Disable button and show loading state
    const originalBtnText = exportBtn.textContent;
    exportBtn.textContent = 'ZIPPING...';
    exportBtn.disabled = true;

    try {
        const zip = new JSZip();
        const imagesFolder = zip.folder("images");
        const metadata = [];

        // Process variants
        for (const variant of variants) {
            // Add image to zip
            const imageName = `image-${variant.id}.png`;
            const base64Data = variant.dataUrl.split(',')[1];
            imagesFolder.file(imageName, base64Data, { base64: true });

            // Build metadata object
            const tokenMetadata = {
                metadataId: variant.id,
                imageRef: imageName,
                name: `${collectionName} #${variant.id}`,
                description: collectionDescription,
                ...variant.traits
            };
            metadata.push(tokenMetadata);
        }

        // Add metadata.json to zip
        zip.file("metadata.json", JSON.stringify(metadata, null, 2));

        // Generate and download zip
        const content = await zip.generateAsync({ type: "blob" });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(content);
        link.download = `${collectionName.replace(/\s+/g, '-').toLowerCase()}.zip`;
        link.click();
        URL.revokeObjectURL(link.href);

    } catch (err) {
        console.error('Export failed:', err);
        alert('Failed to create export zip. See console for details.');
    } finally {
        // Reset button
        exportBtn.textContent = originalBtnText;
        exportBtn.disabled = false;
    }
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

document.getElementById('exportCollection').addEventListener('click', exportCollection);
