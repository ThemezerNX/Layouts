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
    insertionMD5: string;
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

const layoutTable = new pgp.helpers.ColumnSet(
    [
        "name",
        {name: "description", def: undefined},
        {name: "updatedTimestamp", cast: "timestamp without time zone"},
        {name: "uuid", cast: "uuid"},
        "target",
        {name: "color", def: undefined},
        "creatorId",
        {name: "json", def: undefined},
        {name: "commonJson", def: undefined},
        "insertionMD5",
        {name: "cacheId", cast: "integer"},
    ],
    {
        table: "layout",
    },
);

const layoutOptionTable = new pgp.helpers.ColumnSet(
    [
        "layoutId",
        "name",
        {name: "description", def: undefined},
        "type",
        {name: "priority", cast: "integer"},
    ],
    {
        table: "layout_option",
    },
);

const layoutOptionValueTable = new pgp.helpers.ColumnSet(
    [
        {name: "uuid", cast: "uuid"},
        {name: "layoutOptionId", cast: "integer"},
        "json",
        "name",
    ],
    {
        table: "layout_option_value",
    },
);

const layoutOptionValuePreviewsTable = new pgp.helpers.ColumnSet(
    [
        {name: "cacheId", cast: "integer"},
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
        {name: "cacheId", cast: "int"},
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

enum LayoutOptionType {
    TOGGLE = "TOGGLE",
    SELECT = "SELECT",
    INTEGER = "INTEGER",
    DECIMAL = "DECIMAL",
    STRING = "STRING",
    COLOR = "COLOR",
}

const optionAbleTypes = [LayoutOptionType.INTEGER.toString(), LayoutOptionType.DECIMAL.toString(), LayoutOptionType.STRING.toString()];

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

const insertOptions = async (t, layout, insertedLayoutId?, cacheId?) => {
    for (const option of layout.options) {
        // insert layout option
        const {id: insertedLayoutOptionId} = await t.one(() => pgp.helpers.insert({
                layoutId: insertedLayoutId || layout.id,
                ...option,
            },
            layoutOptionTable) + " RETURNING id");
        for (const value of option.values) {
            const {uuid: insertedValueUUID} = await t.one(() => pgp.helpers.insert({
                    layoutOptionId: insertedLayoutOptionId,
                    ...value,
                },
                layoutOptionValueTable) + " RETURNING uuid");
            // insert value previews
            const previews = await generateImages(layout.overlayPath);
            await t.none(() => pgp.helpers.insert({
                layoutOptionValueUUID: insertedValueUUID,
                cacheId,
                ...previews,
            }, layoutOptionValuePreviewsTable));
        }
    }
};

const targetsFolder = path.resolve(__dirname, "..", "targets");

(async () => {
    // In development, make sure there the two system accounts are there. Use 0 for every layout in development mode.
    if (process.env.NODE_ENV == "development") {
        await db.none(`
            INSERT INTO "user" (id, username, "hasAccepted", "isAdmin", "isVerified", roles)
            VALUES (0, 'unknown', FALSE, FALSE, TRUE, '{system}'),
                   (1, 'Nintendo', FALSE, FALSE, TRUE, '{system}')
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

    // TODO: validate priority, validate TYPE enum, validate value counts for TYPE
    // TODO: Global options

    const layouts: Layout[] = [];
    for (const target of Object.keys(targets)) {
        for (const layoutName of targets[target]) {
            const layoutPath = path.join(targetsFolder, target, layoutName);

            // Read details
            const detailsFile = editJsonFile(path.join(layoutPath, "details.json"),
                {autosave: true, stringify_width: 4});
            if (!detailsFile.get("uuid")) {
                detailsFile.set("uuid", uuidv4());
            }
            const layout = detailsFile.toObject() as Layout;
            layout.options = [];
            // Assign the correct target
            layout.target = target;
            // Set the creatorId to 0 if in development (not for layouts by Nintendo)
            if (process.env.NODE_ENV == "development" && layout.creatorId != "1") {
                layout.creatorId = "0";
            }
            // Remove '#' in color field if it is there
            if (layout.color?.startsWith("#")) {
                layout.color = layout.color.substring(1);
            }

            // Read layout.json
            const layoutJsonPath = path.join(layoutPath, "layout.json");
            const layoutOverlayPath = path.join(layoutPath, "overlay.png");
            const hasLayout = existsSync(layoutJsonPath);
            if (!hasLayout && layout.creatorId != "1") {
                throw new Error(`${layoutJsonPath} is required, but does not exist`);
            }
            if (!existsSync(layoutOverlayPath)) throw new Error("Layout overlay does not exist for " + layoutPath);
            layout.overlayPath = layoutOverlayPath;

            if (hasLayout) {
                const layoutFile = editJsonFile(path.join(layoutPath, "layout.json"), {stringify_width: 4});
                layoutFile.unset("Ready8X");
                layoutFile.unset("TargetName");
                layoutFile.unset("ID");
                layoutFile.save();
                layoutFile.unset("PatchName");
                layoutFile.unset("AuthorName");
                layout.json = JSON.stringify(layoutFile.toObject(), null, 4);
            }

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
                        option.name = optionName;
                        if (option.description == "") option.description = null;
                        if (!option.priority || option.priority > 99) throw new Error("Invalid priority for " + optionPath);
                        if (!option.type || !Object.keys(LayoutOptionType).includes(option.type)) throw new Error(
                            "Invalid option type for " + optionPath);
                        if (option.typeOptions && !optionAbleTypes.includes(option.type)) throw new Error(
                            "Invalid typeOptions for " + optionPath);

                        const valuesPath = path.join(optionPath, "values");
                        const valuesFolderContents = readdirSync(valuesPath);
                        if (valuesFolderContents.length % 2 != 0) {
                            throw new Error("Invalid values in value folder " + valuesPath);
                        }
                        option.values = valuesFolderContents.filter((fileName) => fileName.endsWith(".json"))
                            .map((valueFileName) => {
                                const valueName = path.basename(valueFileName, ".json");
                                const valuePath = path.join(valuesPath, valueFileName);
                                const valueOverlayPath = path.join(valuesPath, valueName + ".png");
                                if (!existsSync(valueOverlayPath)) throw new Error(
                                    "Layout option value overlay does not exist for " + valuePath + " at " + valueOverlayPath);

                                const valueFile = editJsonFile(valuePath, {autosave: true, stringify_width: 4});
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

            layout.insertionMD5 = objectHash.MD5(layout);
            // Set updateTimestamp to current time
            layout.updatedTimestamp = new Date();
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
                l.insertionMD5 != dL.insertionMD5,
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

        try {
            await db.tx(async t => {
                for (const layout of newLayouts) {
                    console.log(layout.name);
                    // insert layout
                    const {id: insertedLayoutId} = await t.one(() => pgp.helpers.insert(
                        {
                            ...layout,
                            cacheId: 0,
                        },
                        layoutTable) + " RETURNING id");
                    // insert layout previews
                    const previews = await generateImages(layout.overlayPath);
                    await t.none(() => pgp.helpers.insert({
                        layoutId: insertedLayoutId,
                        cacheId: 0,
                        ...previews,
                    }, layoutPreviewsTable));
                    // insert layout options
                    await insertOptions(t, layout, insertedLayoutId, 0);
                }
            });
            console.log("Insert success ✔️");
        } catch (e) {
            console.error("Insert Failed ❌\n", e);
        }
    }

    if (updatedLayouts.length > 0) {
        console.log("\n---- updatedLayouts:");

        try {
            await db.tx(async t => {
                for (const layout of updatedLayouts) {
                    console.log(layout.name);
                    const existingEntry = dbLayouts.find((dL) => dL.uuid == layout.uuid);

                    // update layout
                    await t.none(() => pgp.helpers.update({
                        ...layout,
                        cacheId: existingEntry.cacheId,
                    }, layoutTable) + ` WHERE uuid = '${existingEntry.uuid}'`);
                    // update layout previews
                    const previews = await generateImages(layout.overlayPath);
                    await t.none(() => pgp.helpers.update({
                            cacheId: existingEntry.cacheId,
                            layoutId: existingEntry.id,
                            ...previews,
                        },
                        layoutPreviewsTable) + ` WHERE "layoutId" = '${existingEntry.id}'`);
                    // delete all layout options for current layoutId
                    await t.none(`DELETE
                                  FROM layout_option
                                  WHERE "layoutId" = '${existingEntry.id}'`);
                    // re-add the layout options, start at existingEntry.cacheId
                    await insertOptions(t, layout, existingEntry.id, existingEntry?.cacheId);
                }
            });
            console.log("Insert success ✔️");
        } catch (e) {
            console.error("Insert Failed ❌\n", e);
        }
    }

    if (newLayouts.length == 0 && updatedLayouts.length == 0) {
        console.log("No changes detected ✔️");
    }

    // Insert the data into the database and close connection
    await db.$pool.end();
})
();

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
