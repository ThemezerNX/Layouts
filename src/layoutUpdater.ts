import * as path from "path";
import {accessSync, constants, existsSync, readdirSync, readFileSync, statSync} from "fs";
import {db, pgp} from "./db";
import {isTarget} from "@themezernx/target-parser/dist";
import {v4 as uuidv4} from "uuid";
import * as editJsonFile from "edit-json-file";
import * as objectHash from "object-hash";
import * as sharp from "sharp";

interface Value {
    name: string;
    uuid: string;
    json: string;
    overlayPath: string;
}

interface Option {
    name: string;
    description: string;
    type: string;
    typeOptions?: {
        min?: number
        max?: number
    };
    priority: number;
    values: Value[];
}

interface Layout {
    name: string;
    description: string;
    creatorId: string;
    color: string;
    uuid: string;
    target: string;
    updatedTimestamp: Date;
    json: string;
    commonJson: string;
    overlayPath: string;
    options?: Option[];
}

const exist = (dir) => {
    try {
        accessSync(dir, constants.F_OK | constants.R_OK | constants.W_OK);
        return true;
    } catch (e) {
        return false;
    }
};

// optional function for pgp if prop does not exist in object
// export function str(column) {
//     return {
//         name: column,
//         skip: (c) => !c.exists,
//     };
// }

const layoutTable = new pgp.helpers.ColumnSet(
    [
        "name",
        "description",
        {name: "updatedTimestamp", cast: "timestamp without time zone"},
        {name: "uuid", cast: "uuid"},
        "target",
        "color",
        "creatorId",
        "json",
        "commonJson",
    ],
    {
        table: "layout",
    },
);

const layoutOptionTable = new pgp.helpers.ColumnSet(
    [
        "layoutId",
        "name",
        "description",
        "type",
        "priority",
    ],
    {
        table: "layout_option",
    },
);

const layoutOptionValueTable = new pgp.helpers.ColumnSet(
    [
        {name: "uuid", cast: "uuid"},
        "layoutOptionId",
        "json",
        "name",
    ],
    {
        table: "layout_option_value",
    },
);

const layoutOptionValuePreviewsTable = new pgp.helpers.ColumnSet(
    [
        "cacheID",
        "image720File",
        "image360File",
        "image240File",
        "image180File",
        "imagePlaceholderFile",
        {name: "layoutOptionValueUUID", cast: "uuid"},
    ],
    {
        table: "layout_option_value_previews",
    },
);

const layoutPreviewsTable = new pgp.helpers.ColumnSet(
    [
        "cacheId",
        "image720File",
        "image360File",
        "image240File",
        "image180File",
        "imagePlaceholderFile",
        "layoutId",
    ],
    {
        table: "layout_previews",
    },
);

interface Previews {
    image720File: Buffer;
    image360File: Buffer;
    image240File: Buffer;
    image180File: Buffer;
    imagePlaceholderFile: Buffer;
}

const resizeImage = (path: string, width: number, height: number) => {
    return sharp(path).resize(width, height, {fit: sharp.fit.cover}).toFormat("webp").toBuffer();
};

const generateImages = async (fullImagePath: string): Promise<Previews> => {
    return {
        image720File: await resizeImage(fullImagePath, 1280, 720),
        image360File: await resizeImage(fullImagePath, 640, 360),
        image240File: await resizeImage(fullImagePath, 426, 240),
        image180File: await resizeImage(fullImagePath, 320, 180),
        imagePlaceholderFile: await resizeImage(fullImagePath, 80, 45),
    };
};

const targetsFolder = path.resolve(__dirname, "..", "targets");

(async () => {
    // In development, make sure there the two system accounts are there. Use 0 for every layout in development mode.
    if (process.env.NODE_ENV == "development") {
        await db.none(`
            INSERT INTO "user" (id, username, "hasAccepted", "isAdmin", "isVerified", roles, "cacheID")
            VALUES (0, 'unknown', FALSE, FALSE, TRUE, '{system}', 1),
                   (1, 'Nintendo', FALSE, FALSE, TRUE, '{system}', 1)
            ON CONFLICT DO NOTHING
        `);
    }

    // Start reading the 'targets' folders and map every target with a list of layout names
    const targets = {};
    readdirSync(targetsFolder)
        .filter((folderName) => {
            return statSync(path.join(targetsFolder, folderName)).isDirectory() && isTarget(folderName);
        })
        .forEach((target) => {
            targets[target] = readdirSync(path.join(targetsFolder, target));
        });

    //TODO: validate priority, validate TYPE enum, validate value counts for TYPE

    const layouts: Layout[] = [];
    for (const target of Object.keys(targets)) {
        for (const layoutName of targets[target]) {
            const layoutPath = path.join(targetsFolder, target, layoutName);

            // Read details
            const detailsFile = editJsonFile(path.join(layoutPath, "details.json"), {autosave: true});
            if (!detailsFile.get("uuid")) {
                detailsFile.set("uuid", uuidv4());
            }
            const layout = detailsFile.toObject() as Layout;
            layout.options = [];
            // Assign the correct target
            layout.target = target;
            // Set updateTimestamp to current time
            layout.updatedTimestamp = new Date();
            // Remove '#' in color field if it is there
            if (layout.color?.startsWith("#")) {
                layout.color = layout.color.substring(1);
            }

            // Read layout.json
            const layoutJsonPath = path.join(layoutPath, "layout.json");
            const layoutOverlayPath = path.join(layoutPath, "overlay.png");
            if (existsSync(layoutJsonPath)) {
                if (!existsSync(layoutOverlayPath)) throw new Error("Layout overlay does not exist for " + layoutPath);
                layout.overlayPath = layoutOverlayPath;

                const layoutFile = editJsonFile(path.join(layoutPath, "layout.json"), {autosave: true});
                layoutFile.unset("Ready8X");
                layoutFile.unset("PatchName");
                layoutFile.unset("AuthorName");
                layoutFile.unset("TargetName");
                layoutFile.unset("ID");
                layout.json = JSON.stringify(layoutFile, null, 4);

                // Read common.json
                try {
                    layout.commonJson = JSON.stringify(readFileSync(path.join(layoutPath, "common.json"), "utf-8"),
                        null,
                        4);
                } catch (e) {
                }

                const optionsPath = path.join(layoutPath, "options");
                if (exist(optionsPath)) {
                    readdirSync(optionsPath)
                        .forEach((optionName) => {
                            const optionPath = path.join(optionsPath, optionName);
                            const option = editJsonFile(path.join(optionPath, "option.json")).toObject() as Option;

                            const valuesPath = path.join(optionPath, "values");
                            const valuesFolderContents = readdirSync(valuesPath);
                            if (valuesFolderContents.length % 2 != 0) {
                                throw new Error("Invalid values in value folder");
                            }
                            option.values = valuesFolderContents.filter((fileName) => fileName.endsWith(".json"))
                                .map((valueFileName) => {
                                    const valueName = path.basename(valueFileName, "json");
                                    const valuePath = path.join(valuesPath, valueFileName);
                                    const valueOverlayPath = path.join(valuesPath, valueName + ".png");
                                    if (!existsSync(valueOverlayPath)) throw new Error(
                                        "Layout option value overlay does not exist for " + valuePath);

                                    const valueFile = editJsonFile(valuePath, {autosave: true});
                                    if (!valueFile.get("uuid")) {
                                        valueFile.set("uuid", uuidv4());
                                    }
                                    const value = valueFile.toObject() as Value;
                                    const uuid = value.uuid;
                                    delete value.uuid;
                                    return {
                                        name: valueName,
                                        uuid: uuid,
                                        json: JSON.stringify(value, null, 4),
                                        overlayPath: valueOverlayPath,
                                    };
                                });

                            layout.options.push(option);
                        });
                }
            } else {
                throw new Error(`${layoutJsonPath} does not exist`);
            }

            layouts.push(layout);
        }
    }

    // Fetch the existing layouts
    const dbLayouts = await db.any(`
        SELECT *
        FROM layout
    `);

    const newLayouts = layouts.filter((l) => !dbLayouts.some((dL) => dL.uuid === l.uuid));
    const updatedLayouts = layouts
        .filter((l) =>
            dbLayouts.find((dL) =>
                dL.uuid == l.uuid &&
                // Compare hashes to see if any data was updated
                objectHash.MD5(l) != dL.insertionMD5,
            ),
        );
    const deletedLayouts = dbLayouts.filter((dL) => !layouts.some((l) => l.uuid === dL.uuid));
    if (deletedLayouts.length > 0) {
        throw new Error("Some layouts were removed. This should not be the case.\n" + JSON.stringify(deletedLayouts,
            null,
            4));
    }

    if (newLayouts.length > 0) {
        console.log("\n---- newLayouts:");
        console.log(newLayouts.map((l) => l.name).join("\n"));

        try {
            await db.tx(async t => {
                for (const layout of newLayouts) {
                    // insert layout
                    const insertedLayoutId = await t.one(() => pgp.helpers.insert(layout,
                        layoutTable) + " RETURNING id");
                    // insert layout previews
                    await t.none(() => pgp.helpers.insert({
                        layoutId: insertedLayoutId,
                        ...generateImages(layout.overlayPath),
                    }, layoutPreviewsTable));
                    // insert options
                    for (const option of layout.options) {
                        const insertedLayoutOptionId = await t.one(() => pgp.helpers.insert(option,
                            layoutOptionTable) + " RETURNING id");
                        for (const value of option.values) {
                            const insertedValueUUID = await t.one(() => pgp.helpers.insert({
                                    layoutOptionId: insertedLayoutOptionId,
                                    ...value,
                                },
                                layoutOptionValueTable) + " RETURNING uuid");
                            await t.none(() => pgp.helpers.insert({
                                layoutOptionValueUUID: insertedValueUUID,
                                ...generateImages(value.overlayPath),
                            }, layoutOptionValuePreviewsTable));
                        }
                    }
                }
            });
            console.log("Insert success ✔️");
        } catch (e) {
            console.error("Insert Failed ❌", e.message);
        }
    }

    if (updatedLayouts.length > 0) {
        console.log("\n---- existingLayouts:");
        console.log(updatedLayouts.map((l) => l.name).join("\n"));
    }

    // Insert the data into the database and close connection
    await db.$pool.end();
})();

//
// async function run() {
//
//     const layouts = layoutFolders.map((lF) => {
//
//         const pieces = [];
//         if (exist(`${lF}/pieces`)) {
//             const options = readdirSync(`${lF}/pieces`);
//             options.forEach((option) => {
//                 const split = option.split("_");
//                 if (split.length > 1) split.shift();
//                 const optionName = split.join();
//
//                 const values = readdirSync(`${lF}/pieces/${option}`);
//                 const jsons = values.filter((v) => v.endsWith(".json"));
//
//                 const valueJsons = [];
//                 jsons.forEach((j) => {
//                     const valueName = j.replace(".json", "");
//
//                     const valueFile = editJsonFile(`${lF}/pieces/${option}/${valueName}.json`);
//                     if (!valueFile.get("uuid")) {
//                         valueFile.set("uuid", uuid());
//                     }
//
//                     const value = valueFile.toObject();
//                     const value_uuid = value.uuid;
//                     delete value.uuid;
//
//                     valueJsons.push({
//                         value: jsons.length > 1 ? valueName : true,
//                         uuid: value_uuid,
//                         image: values.includes(`${valueName}.png`) ? `${valueName}.png` : null,
//                         json: JSON.stringify(value),
//                     });
//                 });
//
//                 pieces.push({
//                     name: optionName,
//                     values: valueJsons,
//                 });
//             });
//         }
//
//         const layout_str = JSON.stringify(jsonFile.toObject());
//
//         let resJson: any = {
//             uuid: details.uuid,
//             details,
//             baselayout: layout_str !== "{}" ? layout_str : null,
//             target: jsonFile.get("TargetName")?.replace(/.szs/i, "") || lF.split("/")[0],
//             last_updated: new Date(),
//             pieces,
//             commonlayout,
//             creatorId: details.creatorId,
//         };
//
//         return resJson;
//     });
//
//     const newLayouts = layouts.filter((l) => !dbLayouts.some((dL) => dL.uuid === l.uuid)),
//         deletedLayouts = dbLayouts.filter((dL) => !layouts.some((l) => l.uuid === dL.uuid)),
//         existingLayouts = dbLayouts
//             .filter((l) =>
//                 layouts.find(
//                     (dL) =>
//                         l.uuid === dL.uuid &&
//                         // Check if any of the fields changed
//                         (JSON.stringify(dL.details) !== JSON.stringify(l.details) ||
//                             dL.baselayout !== l.baselayout ||
//                             JSON.stringify(dL.pieces) !== JSON.stringify(l.pieces) ||
//                             dL.commonlayout !== l.commonlayout ||
//                             dL.creatorId !== l.creatorId),
//                 ),
//             )
//             .map((dL) => layouts.find((l) => l.uuid === dL.uuid));
//
//     let nL,
//         dL = [],
//         oL;
//
//     const cs = new pgp.helpers.ColumnSet(
//         [
//             {name: "uuid", cast: "uuid"},
//             {name: "details", cast: "json"},
//             "baselayout",
//             "target",
//             {name: "last_updated", cast: "timestamp without time zone"},
//             {name: "pieces", cast: "json[]"},
//             "commonlayout",
//             "creatorId",
//         ],
//         {
//             table: "layouts",
//         },
//     );
//
//     if (newLayouts.length > 0) {
//         console.log("\n---- newLayouts:");
//         console.log(newLayouts.map((l) => l.details.name).join("\n"));
//
//         const query = () => pgp.helpers.insert(newLayouts, cs);
//         nL = db.none(query);
//     }
//
//     if (deletedLayouts.length > 0) {
//         console.log("\n---- deletedLayouts:");
//         dL = deletedLayouts.map((l) => {
//             console.log(`${l.details.name}\n`);
//
//             return db.none(
//                 `
//                     DELETE
//                     FROM layout
//                     WHERE uuid = $1
//                 `,
//                 [l.uuid],
//             );
//         });
//     }
//
//     if (existingLayouts.length > 0) {
//         console.log("\n---- existingLayouts:");
//         console.log(existingLayouts.map((l) => l.details.name).join("\n"));
//
//         const query = () => pgp.helpers.update(existingLayouts, cs) + " where v.uuid = t.uuid";
//         oL = db.none(query);
//     }
//
//     Promise.all([nL, ...dL, oL]).then(() => db.$pool.end());
// }
//
// run();
