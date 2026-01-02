let uploadedImage = null;
let variants = [];

// Theme Definitions
const THEMES = {
    VIBRANT: {
        name: 'Max-Chroma',
        weight: 50,
        palette: { minColors: 2, maxColors: 4, minSat: 85, maxSat: 100, minLight: 40, maxLight: 70, highContrast: true },
        contrast: { min: 1.4, max: 2.2 }
    },
    MONO: {
        name: 'Bi-Level',
        weight: 38,
        palette: { minColors: 2, maxColors: 2, isMonoPlus: true },
        contrast: { min: 2.0, max: 3.5 }
    },
    CONTRAST: {
        name: 'Split-Chromatic',
        weight: 25,
        palette: { minColors: 3, maxColors: 4, minSat: 60, maxSat: 100, minLight: 30, maxLight: 80, strategy: 'split_complementary' },
        contrast: { min: 1.4, max: 2.5 }
    },
    HARMONY: {
        name: 'Triadic-Axis',
        weight: 15,
        palette: { minColors: 3, maxColors: 5, minSat: 80, maxSat: 100, minLight: 40, maxLight: 60, useKeyColors: true },
        contrast: { min: 1.5, max: 2.5 }
    },
    BRIGHT: {
        name: 'High-Luminance',
        weight: 10,
        palette: { minColors: 4, maxColors: 8, minSat: 20, maxSat: 85, minLight: 60, maxLight: 95, variance: true },
        contrast: { min: 0.5, max: 1.2 }
    },
    DUAL: {
        name: 'Di-Chromatic',
        weight: 7,
        palette: { minColors: 2, maxColors: 2, minSat: 60, maxSat: 100, minLight: 20, maxLight: 80, strategy: 'complementary' },
        contrast: { min: 1.5, max: 2.5 }
    },
    TONAL: {
        name: 'Analogous-Range',
        weight: 4,
        palette: { minColors: 3, maxColors: 5, minSat: 50, maxSat: 90, minLight: 30, maxLight: 70, strategy: 'analogous' },
        contrast: { min: 1.1, max: 1.8 }
    },
    ACCENT: {
        name: 'Mono-Plus',
        weight: 1,
        palette: { minColors: 3, maxColors: 4, isMonoPlus: true },
        contrast: { min: 2.0, max: 3.5 }
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

// Fisher-Yates Shuffle with seeded RNG
function shuffleArray(array, rng) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

// Weighted Theme Selector (Fallback for rerolls/over-capacity)
function selectTheme(rng) {
    const roll = rng();
    let accumulatedWeight = 0;
    
    let totalWeight = 0;
    for (const key in THEMES) totalWeight += THEMES[key].weight;

    for (const key in THEMES) {
        accumulatedWeight += THEMES[key].weight / totalWeight;
        if (roll <= accumulatedWeight) {
            return { ...THEMES[key], key };
        }
    }
    return { ...THEMES.VIBRANT, key: 'VIBRANT' };
}

// Helper to check for muddy colors (low sat AND low light)
function isMuddy(h, s, l) {
    return s < 0.4 && l < 0.4;
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

// Helper to invert image data
function invertImageData(imageData) {
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
        data[i] = 255 - data[i];
        data[i + 1] = 255 - data[i + 1];
        data[i + 2] = 255 - data[i + 2];
    }
}

// Pre-process effects for variance
function applyPreProcess(ctx, img, width, height, rng) {
    ctx.clearRect(0, 0, width, height);
    
    ctx.save();
    // 1. Hue Rotation (±20 degrees)
    const hueShift = (rng() * 40) - 20;
    ctx.filter = `hue-rotate(${hueShift}deg)`;
    
    // 2. Phase Shift (±2px translation for pattern variance)
    const shiftX = (rng() * 4) - 2;
    const shiftY = (rng() * 4) - 2;
    ctx.drawImage(img, shiftX, shiftY, width, height);
    ctx.restore();

    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    // 2. Random Inversion (33% chance)
    if (rng() < 0.33) {
        invertImageData(imageData);
    }

    // 3. Brightness/Contrast Jitter (±15%)
    const brightness = (rng() * 0.3) - 0.15; // -0.15 to +0.15
    const contrast = 1 + ((rng() * 0.3) - 0.15); // 0.85 to 1.15

    for (let i = 0; i < data.length; i += 4) {
        // Filmic grain: bell-curve distribution for natural texture
        const noise = ((rng() + rng() + rng()) / 3 - 0.5) * 15; 

        for (let j = 0; j < 3; j++) {
            // Apply contrast
            let val = data[i + j] / 255;
            val = ((val - 0.5) * contrast) + 0.5;
            // Apply brightness
            val += brightness;
            
            data[i + j] = Math.max(0, Math.min(255, (val * 255) + noise));
        }
    }

    return imageData;
}

// Generate theme-aware color palette
function generateColorPalette(theme, rng) {
    const colors = [];
    const settings = theme.palette;
    const numColors = Math.floor(settings.minColors + rng() * (settings.maxColors - settings.minColors + 1));
    
    // Pick Key Color
    let keyHue = rng() * 360;
    if (settings.useKeyColors) {
        // Snap to bold primary/secondary hues
        const targets = [0, 60, 120, 180, 240, 300];
        keyHue = targets[Math.floor(rng() * targets.length)] + (rng() * 20 - 10); // +/- 10 degrees variation
    }

    const hueName = getHueName(keyHue);
    
    // Harmony Strategy
    let strategy = settings.strategy || 'random';
    if (!settings.strategy) {
        if (settings.isMonoPlus) strategy = 'mono_plus';
        else if (settings.spread) strategy = 'spread';
        else if (settings.highContrast) strategy = 'complementary';
        else if (settings.useKeyColors) strategy = 'triadic';
        else if (settings.variance) {
            const strategies = ['spread', 'triadic', 'analogous', 'split_complementary', 'random'];
            strategy = strategies[Math.floor(rng() * strategies.length)];
        }
    }

    for (let i = 0; i < numColors; i++) {
        let h, s, l;
        let attempts = 0;
        let validColor = false;

        while (!validColor && attempts < 10) {
            attempts++;
            
            // Hue Generation
            if (strategy === 'mono_plus') {
                // 50% chance to invert (Light background, dark text/elements)
                const invert = rng() > 0.5;
                
                if (i === 0) {
                    h = keyHue / 360; // Accent
                    s = (80 + rng() * 20) / 100; // High saturation accent
                    l = (40 + rng() * 20) / 100; // Mid lightness for visibility
                } else {
                    h = 0; // Grayscale
                    s = 0;
                    // Extreme contrast logic
                    if (invert) {
                        // Light background logic
                        l = i === 1 ? 0.95 : (i === numColors - 1 ? 0.05 : 0.5);
                    } else {
                        // Dark background logic
                        l = i === 1 ? 0.05 : (i === numColors - 1 ? 0.95 : 0.5);
                    }
                }
            } else if (strategy === 'spread') {
                h = ((keyHue + (i * (360 / numColors))) % 360) / 360;
            } else if (strategy === 'complementary') {
                const offset = i % 2 === 0 ? 0 : 180;
                h = ((keyHue + offset + rng() * 30 - 15) % 360) / 360;
            } else if (strategy === 'triadic') {
                const offset = (i % 3) * 120;
                h = ((keyHue + offset + rng() * 20 - 10) % 360) / 360;
            } else if (strategy === 'analogous') {
                const offset = (i - Math.floor(numColors / 2)) * 30;
                h = ((keyHue + offset + rng() * 20 - 10) % 360) / 360;
            } else if (strategy === 'split_complementary') {
                // Key, Key+150, Key+210
                const offsets = [0, 150, 210, 0, 150]; // Cycle if > 3 colors
                h = ((keyHue + offsets[i % offsets.length] + rng() * 20 - 10) % 360) / 360;
            } else {
                h = ((keyHue + rng() * 60 - 30) % 360) / 360; // Analogous-ish
            }

            // Saturation & Lightness
            if (strategy !== 'mono_plus' || i === 0) {
                let minS = settings.minSat || 40;
                let maxS = settings.maxSat || 100;
                let minL = settings.minLight || 30;
                let maxL = settings.maxLight || 80;

                if (settings.variance) {
                    // Randomly shift ranges slightly for each generation
                    const shiftS = rng() * 20 - 10;
                    const shiftL = rng() * 10 - 5;
                    minS = Math.max(0, minS + shiftS);
                    maxS = Math.min(100, maxS + shiftS);
                    minL = Math.max(0, minL + shiftL);
                    maxL = Math.min(100, maxL + shiftL);
                }

                s = (minS + rng() * (maxS - minS)) / 100;
                l = (minL + rng() * (maxL - minL)) / 100;
            }

            // Mud check
            if (!isMuddy(h, s, l) || strategy === 'mono_plus') {
                validColor = true;
            }
        }

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
function applyDithering(imageData, palette, contrast, rng) {
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
                // Stochastic jitter: ±2% variance
                const stochastic = 1 + (rng() * 0.04 - 0.02);
                data[idx] = Math.max(0, Math.min(255, data[idx] + errR * factor * stochastic));
                data[idx + 1] = Math.max(0, Math.min(255, data[idx + 1] + errG * factor * stochastic));
                data[idx + 2] = Math.max(0, Math.min(255, data[idx + 2] + errB * factor * stochastic));
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

// Apply Channel Shift (Screen Print Misregistration)
function applyChannelShift(imageData, intensity) {
    if (intensity === 'None') return imageData;

    const width = imageData.width;
    const height = imageData.height;
    const input = imageData.data;
    const output = new Uint8ClampedArray(input.length);
    
    // Fixed subtle offset for screen print effect
    const offset = 2; 

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            
            // Shift Red Left
            const rX = Math.min(width - 1, Math.max(0, x - offset));
            const rIdx = (y * width + rX) * 4;
            
            // Shift Blue Right
            const bX = Math.min(width - 1, Math.max(0, x + offset));
            const bIdx = (y * width + bX) * 4;

            output[idx] = input[rIdx];     // Red from left
            output[idx + 1] = input[idx + 1]; // Green stays
            output[idx + 2] = input[bIdx + 2]; // Blue from right
            output[idx + 3] = 255;         // Alpha
        }
    }

    return new ImageData(output, width, height);
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

    // Build theme schedule to ensure "at least once" and exact counts for 150
    const keys = Object.keys(THEMES);
    const guaranteed = [...keys];
    const remainder = [];
    
    keys.forEach(key => {
        const count = THEMES[key].weight - 1; // Subtract the one already in 'guaranteed'
        for (let i = 0; i < count; i++) {
            remainder.push(key);
        }
    });

    shuffleArray(guaranteed, rng);
    shuffleArray(remainder, rng);
    const themePool = guaranteed.concat(remainder);

    if (useTiling) {
        console.log('=== ENTERING TILING MODE ===');
        
        for (let variantIdx = 0; variantIdx < numVariants; variantIdx++) {
            const gridCanvas = document.createElement('canvas');
            gridCanvas.width = img.width * 2;
            gridCanvas.height = img.height * 2;
            const gridCtx = gridCanvas.getContext('2d');
            
            console.log(`Creating 2x2 grid ${variantIdx + 1}: ${gridCanvas.width}x${gridCanvas.height}`);

            // Select theme from pre-calculated pool
            const themeKey = themePool[variantIdx] || keys[Math.floor(rng() * keys.length)];
            const theme = THEMES[themeKey];
            console.log(`Variant ${variantIdx + 1} Theme: ${theme.name}`);

            // Generate 4 different dithered tiles
            const tileTraits = [];
            for (let tileIdx = 0; tileIdx < 4; tileIdx++) {
                const { colors: paletteColors, hueName, numColors } = generateColorPalette(theme, rng);
                const contrast = theme.contrast.min + rng() * (theme.contrast.max - theme.contrast.min);
                
                // Channel Shift Rarity (Per tile)
                const shiftRoll = rng();
                let channelShift = 'None';
                if (shiftRoll > 0.85) channelShift = 'Misprint';

                tileTraits.push({ numColors, hueName, contrast: contrast.toFixed(2), channelShift });

                const tileCanvas = document.createElement('canvas');
                tileCanvas.width = img.width;
                tileCanvas.height = img.height;
                const tileCtx = tileCanvas.getContext('2d');
                
                const imageData = applyPreProcess(tileCtx, img, img.width, img.height, rng);
                
                // 1. Dither
                const dithered = applyDithering(imageData, paletteColors, contrast, rng);
                
                // 2. Channel Shift
                const shifted = applyChannelShift(dithered, channelShift);
                
                tileCtx.putImageData(shifted, 0, 0);

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
                themeKey: themeKey,
                traits: {
                    'System': theme.name
                }
            });

            const progress = ((variantIdx + 1) / numVariants) * 100;
            document.getElementById('progress').style.width = `${progress}%`;
            await new Promise(resolve => setTimeout(resolve, 0));
        }
    } else {
        console.log('=== ENTERING SINGLE IMAGE MODE ===');
        
        for (let i = 0; i < numVariants; i++) {
            // Select theme from pre-calculated pool
            const themeKey = themePool[i] || keys[Math.floor(rng() * keys.length)];
            const theme = THEMES[themeKey];
            const { colors: paletteColors, hueName, numColors } = generateColorPalette(theme, rng);
            const contrast = theme.contrast.min + rng() * (theme.contrast.max - theme.contrast.min);

            // Channel Shift Rarity
            const shiftRoll = rng();
            let channelShift = 'None';
            // Screen print misregistration effect (Subtle only)
            if (shiftRoll > 0.85) channelShift = 'Misprint'; // 15% chance for "Misprint" (was Subtle)

            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            
            const imageData = applyPreProcess(ctx, img, canvas.width, canvas.height, rng);
            
            // 1. Dither
            const dithered = applyDithering(imageData, paletteColors, contrast, rng);
            
            // 2. Apply Channel Shift (Post-process)
            const shifted = applyChannelShift(dithered, channelShift);
            
            ctx.putImageData(shifted, 0, 0);

            variants.push({
                id: i + 1,
                dataUrl: canvas.toDataURL(),
                tiled: false,
                theme: theme.name,
                themeKey: themeKey,
                traits: {
                    'System': theme.name
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

// Reroll logic
async function regenerateVariant(id) {
    const variantIndex = variants.findIndex(v => v.id === id);
    if (variantIndex === -1 || !uploadedImage) return;

    const card = document.getElementById(`variant-card-${id}`);
    const rerollBtns = card?.querySelectorAll('button[onclick^="regenerateVariant"]');
    
    if (rerollBtns) {
        rerollBtns.forEach(btn => {
            btn.disabled = true;
            const isOverlay = btn.classList.contains('absolute');
            btn.innerHTML = `
                <svg class="animate-spin ${isOverlay ? 'h-4 w-4' : 'h-3 w-3'}" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                ${isOverlay ? '' : '...'}
            `;
        });
    }

    const variant = variants[variantIndex];
    const rng = Math.random; // True random for reroll
    
    // Load image
    const img = new Image();
    img.src = uploadedImage;
    await new Promise(resolve => { img.onload = resolve; });

    let newVariant = { ...variant };
    const theme = THEMES[variant.themeKey] || selectTheme(rng);

    if (variant.tiled) {
        // Tiled Logic
        const gridCanvas = document.createElement('canvas');
        gridCanvas.width = img.width * 2;
        gridCanvas.height = img.height * 2;
        const gridCtx = gridCanvas.getContext('2d');
        
        const tileTraits = [];
        for (let tileIdx = 0; tileIdx < 4; tileIdx++) {
            const { colors: paletteColors, hueName, numColors } = generateColorPalette(theme, rng);
            const contrast = theme.contrast.min + rng() * (theme.contrast.max - theme.contrast.min);
            
            // Channel Shift Rarity (Per tile)
            const shiftRoll = rng();
            let channelShift = 'None';
            if (shiftRoll > 0.85) channelShift = 'Misprint';

            tileTraits.push({ numColors, hueName, contrast: contrast.toFixed(2), channelShift });

            const tileCanvas = document.createElement('canvas');
            tileCanvas.width = img.width;
            tileCanvas.height = img.height;
            const tileCtx = tileCanvas.getContext('2d');
            
            const imageData = applyPreProcess(tileCtx, img, img.width, img.height, rng);
            const dithered = applyDithering(imageData, paletteColors, contrast, rng);
            const shifted = applyChannelShift(dithered, channelShift);
            tileCtx.putImageData(shifted, 0, 0);

            const x = (tileIdx % 2) * img.width;
            const y = Math.floor(tileIdx / 2) * img.height;
            gridCtx.drawImage(tileCanvas, x, y);
        }

        newVariant.dataUrl = gridCanvas.toDataURL();
        newVariant.theme = theme.name;
        newVariant.traits = {
            'System': theme.name
        };

    } else {
        // Single Logic
        const { colors: paletteColors, hueName, numColors } = generateColorPalette(theme, rng);
        const contrast = theme.contrast.min + rng() * (theme.contrast.max - theme.contrast.min);

        // Channel Shift Rarity
        const shiftRoll = rng();
        let channelShift = 'None';
        if (shiftRoll > 0.85) channelShift = 'Misprint';

        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        
        const imageData = applyPreProcess(ctx, img, canvas.width, canvas.height, rng);
        const dithered = applyDithering(imageData, paletteColors, contrast, rng);
        const shifted = applyChannelShift(dithered, channelShift);
        ctx.putImageData(shifted, 0, 0);

        newVariant.dataUrl = canvas.toDataURL();
        newVariant.theme = theme.name;
        newVariant.traits = {
            'System': theme.name
        };
    }

    variants[variantIndex] = newVariant;
    
    // Update DOM
    if (card) {
        const newCard = renderVariantCard(newVariant);
        card.replaceWith(newCard);
    }
}

function renderVariantCard(variant) {
    const div = document.createElement('div');
    div.id = `variant-card-${variant.id}`;
    div.className = 'card group bg-[#0a0a0a] border border-[#333] hover:border-[#666] transition-colors rounded-xl overflow-hidden';
    
    // Theme color badge logic
    let badgeColor = 'bg-gray-800 text-gray-300';
    if (variant.theme === 'Max-Chroma') badgeColor = 'bg-fuchsia-900/50 text-fuchsia-200 border border-fuchsia-500/30';
    if (variant.theme === 'Bi-Level') badgeColor = 'bg-white text-black font-bold';
    if (variant.theme === 'Split-Chromatic') badgeColor = 'bg-indigo-900/40 text-indigo-200 border border-indigo-500/30';
    if (variant.theme === 'Triadic-Axis') badgeColor = 'bg-blue-900/50 text-blue-200 border border-blue-500/30';
    if (variant.theme === 'High-Luminance') badgeColor = 'bg-rose-100 text-rose-800 border border-rose-200';
    if (variant.theme === 'Di-Chromatic') badgeColor = 'bg-orange-900/40 text-orange-200 border border-orange-500/30';
    if (variant.theme === 'Analogous-Range') badgeColor = 'bg-teal-900/40 text-teal-200 border border-teal-500/30';
    if (variant.theme === 'Mono-Plus') badgeColor = 'bg-zinc-800 text-white border border-white/20';

    div.innerHTML = `
        <div class="aspect-square w-full bg-[#111] border-b border-[#333] p-4 flex items-center justify-center relative group-hover:bg-[#151515] transition-colors">
            <img src="${variant.dataUrl}" class="max-w-full max-h-full object-contain shadow-lg">
            <button onclick="regenerateVariant(${variant.id})" class="absolute top-2 right-2 p-2 bg-black/50 hover:bg-black/80 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm" title="Reroll Variant">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg>
            </button>
        </div>
        <div class="p-4">
            <div class="flex justify-between items-start mb-4">
                <div>
                    <span class="font-mono text-xs text-gray-500 block mb-1">#${variant.id}</span>
                    <div class="text-xs font-medium px-2 py-0.5 rounded-full inline-block ${badgeColor}">
                        ${variant.theme.toUpperCase()}
                    </div>
                </div>
            </div>

            <div class="flex gap-2">
                <button onclick="regenerateVariant(${variant.id})" class="flex-1 py-2 text-xs font-medium border border-[#333] rounded hover:bg-white hover:text-black hover:border-white transition-all flex items-center justify-center gap-2 group/reroll">
                    <svg class="w-3 h-3 transition-transform group-hover/reroll:rotate-180 duration-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg>
                    Reroll
                </button>
                <button onclick="downloadVariant(${variant.id})" class="flex-1 py-2 text-xs font-medium border border-[#333] rounded hover:bg-white hover:text-black hover:border-white transition-all">
                    PNG
                </button>
            </div>
        </div>
    `;
    return div;
}

function displayVariants() {
    const grid = document.getElementById('variantsGrid');
    grid.innerHTML = '';
    document.getElementById('variantCount').textContent = variants.length;
    document.getElementById('results').classList.remove('hidden');

    // Calculate system summary
    const summary = {};
    variants.forEach(v => {
        summary[v.theme] = (summary[v.theme] || 0) + 1;
    });

    const summaryContainer = document.getElementById('systemSummary');
    summaryContainer.innerHTML = '';
    
    // Sort systems by count (descending)
    Object.entries(summary)
        .sort((a, b) => b[1] - a[1])
        .forEach(([theme, count]) => {
            const badge = document.createElement('div');
            // Re-use badge color logic or just use a standard one for summary
            let badgeStyle = 'bg-zinc-900 border border-zinc-800 text-zinc-400';
            
            // Map theme back to specific style if possible (mirroring renderVariantCard)
            if (theme === 'Max-Chroma') badgeStyle = 'bg-fuchsia-900/30 text-fuchsia-300 border border-fuchsia-500/20';
            if (theme === 'Bi-Level') badgeStyle = 'bg-white/10 text-white border border-white/20';
            if (theme === 'Split-Chromatic') badgeStyle = 'bg-indigo-900/30 text-indigo-300 border border-indigo-500/20';
            if (theme === 'Triadic-Axis') badgeStyle = 'bg-blue-900/30 text-blue-300 border border-blue-500/20';
            if (theme === 'High-Luminance') badgeStyle = 'bg-rose-900/30 text-rose-300 border border-rose-500/20';
            if (theme === 'Di-Chromatic') badgeStyle = 'bg-orange-900/30 text-orange-300 border border-orange-500/20';
            if (theme === 'Analogous-Range') badgeStyle = 'bg-teal-900/30 text-teal-300 border border-teal-500/20';
            if (theme === 'Mono-Plus') badgeStyle = 'bg-zinc-800 text-white border border-white/20';

            badge.className = `px-3 py-1 rounded-full text-[10px] font-mono flex items-center gap-2 ${badgeStyle}`;
            badge.innerHTML = `<span>${theme.toUpperCase()}</span><span class="opacity-50 text-[9px]">${count}</span>`;
            summaryContainer.appendChild(badge);
        });

    variants.forEach(variant => {
        grid.appendChild(renderVariantCard(variant));
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
// Note: 'uploadBtn' was replaced by 'uploadPlaceholder' in HTML, but we'll attach listener to the placeholder ID
// The click handler is also inline in the HTML onclick attribute, but adding it here is safer/cleaner.

// We removed 'uploadBtn' from DOM, so let's target the new placeholder if we want JS handling,
// but the HTML already has onclick="document.getElementById('imageUpload').click()".
// Let's just fix the imageUpload change handler to hide the placeholder.

document.getElementById('imageUpload').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            uploadedImage = e.target.result;
            document.getElementById('preview').src = uploadedImage;
            document.getElementById('preview').classList.remove('hidden');
            document.getElementById('uploadPlaceholder').classList.add('hidden'); // Hide the upload box
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
        system: v.theme,
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
