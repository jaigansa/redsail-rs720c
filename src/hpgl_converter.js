const parse = require('svg-path-parser');

/**
 * HPGL Converter for Redsail RS720C
 * Standard Setup:
 * - HPGL X: Roll (Feed direction, Depth)
 * - HPGL Y: Carriage (Beam direction, Width)
 * 
 * Mapping from Canvas (Screen):
 * - Canvas X (0 to Width) -> Machine Carriage (HPGL Y, 0 to 630mm)
 * - Canvas Y (0 to Height) -> Machine Roll (HPGL X, 0 to Depth)
 */
function toHpgl(paths, config) {
    const stepsPerMm = parseFloat(config.stepsPerMm) || 40;
    
    const offsetX = parseFloat(config.offsetX) || 0;
    const offsetY = parseFloat(config.offsetY) || 0;
    const dryRun = !!config.dryRun;
    
    const maxX = parseInt(config.maxX) || 25200;
    const maxY = parseInt(config.maxY) || 1000000;

    const toSteps = (val) => Math.round(val * stepsPerMm);

    const format = (mmX, mmY) => {
        if (isNaN(mmX) || isNaN(mmY)) {
            throw new Error("Invalid coordinates (NaN). Check your design for broken paths.");
        }

        const rawCarriage = mmX + offsetX;
        const rawRoll = mmY + offsetY;

        const sCarriage = toSteps(rawCarriage);
        const sRoll = toSteps(rawRoll);

        const tol = stepsPerMm * 15; // Increased to 15mm tolerance
        if (sCarriage < -tol || sCarriage > maxX + tol || sRoll < -tol || sRoll > maxY + tol) {
            const mmC = Math.round(sCarriage/stepsPerMm);
            const mmR = Math.round(sRoll/stepsPerMm);
            const limC = Math.round(maxX/stepsPerMm);
            throw new Error(`Boundary Overflow: Design is at (${mmC}mm, ${mmR}mm), but limit is 0 to ${limC}mm. Move your design onto the bed.`);
        }

        const cCarriage = Math.max(0, Math.min(maxX, sCarriage));
        const cRoll = Math.max(0, Math.min(maxY, sRoll));

        return `${cRoll},${cCarriage}`;
    };

    // Initialize Redsail: Select Pen 1. 
    // Removed IN; because it resets the machine-origin and creates a gap.
    let output = `SP1;${dryRun ? 'PU;' : ''}`;
    
    let penState = 'UP';
    let currentCmd = "";

    const flush = () => {
        if (currentCmd) {
            output += currentCmd + ";";
            currentCmd = "";
        }
    };

    paths.forEach(path => {
        if (!path.segments || path.segments.length === 0) return;
        
        path.segments.forEach(([cmd, x, y]) => {
            if (cmd === 'M') {
                flush();
                output += `PU${format(x, y)};`;
                penState = 'UP';
            } else if (cmd === 'L') {
                const targetState = dryRun ? 'PU' : 'PD';
                if (penState !== targetState || currentCmd.length > 120) {
                    flush();
                    currentCmd = targetState + format(x, y);
                    penState = targetState;
                } else {
                    currentCmd += "," + format(x, y);
                }
            }
        });
        flush();
    });

    // Finalize: Pen Up, Move to Home/Start, Pen In
    // Removed IN; here as well.
    output += "PU0,0;SP0;";
    output = output.replace(/;+/g, ';'); // Clean up double semicolons

    return { hpgl: output, stats: { cutDistMm: 0, travelDistMm: 0, estTimeSec: 0 } };
}

module.exports = { toHpgl };
