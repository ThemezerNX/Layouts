# **Themezer Layouts**

![Deploy](https://github.com/ThemezerNX/Layouts/workflows/Deploy/badge.svg)

This repository holds all layouts with pieces available on the website.
Pieces are small json files with patches for the original layout. This way the visitor can modify the layout to their taste. The Themezer website downloads the layout and saves the layout id and pieces uuids as a string in the ID field in the layout.json.
For Themezer this ID string has the following structure:

```
<service>:[layout id]|[pieces uuids separated by ',']
```

An example:

```json
    ...
    "AuthorName": "Name",
    "TargetName": "ResidentMenu.szs",
    "ID": "Themezer:0000f|e96002f2-b47a-11ea-b3de-0242ac130004,f057c2f2-b47a-11ea-b3de-0242ac130004",
    ...
```

A user should **never modify the ID value manually** in a downloaded layout from Themezer.

# **Submitting**

If you really, really don't like reading [start here](#Layout-Submission-Example).

## **Layouts**

Layout and piece submissions happen through pull requests.
Anyone with a GitHub account can contribute.

This repository has the following structure:
(everyting with a `*` is mandatory)

```
.
└── [target file *]
    └── [layout name *]
        ├── common.json
        ├── details.json *
        ├── layout.json *
        ├── overlay.png *
        └── pieces
            ├── [piece no.]_[Piece Title *]
            |   ├── [Value].json *
            |   └── [Value].png *
                //  ^ A single value becomes a toggle

            └── [piece no.]_[Piece Title *]
                ├── [Value 1].json *
                ├── [Value 1].png *
                ├── [Value 2].json *
                └── [Value 2].png *
                //  ^ Multiple values become a dropdown
```

### **Notes 2:**

-   For every layout, an overlay.png is required.
-   For every piece value, a png is required.
-   The 'target file' may be any of the following (these are all supported menus. Note that some folders are already created):
    -   `ResidentMenu` (Home Menu)
    -   `Entrance` (Lockscreen)
    -   `Flaunch` (All Apps)
    -   `Set` (Settings)
    -   `Notification` (News)
    -   `Psl` (Player Select)
    -   `MyPage` (User Page)

## **Pieces (optional)**

-   Piece folders should have a prefix: `1_`. This allows you to specify the order the pieces are applied in.
-   The 'Piece Title' is shown on the website as the option.
-   A piece value json always requires a corresponding png. This png is an overlay. The overlay must be made from the layout with only the piece it is for active. File names must **always** match.
-   For a single value (toggle): the value file name does not matter (although they must still match) as it becomes a toggle with the 'Piece Title'
-   For a dropdown: the values filenames _do_ matter. Every value file name will be an entry in the dropdown.
-   When a pull request is merged the `uuid` field is automatically added to the `[value].json`. You must never add/edit this yourself!

## **The `details.json`**

The `details.json` contains information to display on the website. You're allowed to edit the following fields:

(everyting with a `*` is mandatory)

```json
{
	"name": "", *
	"description": "", *
	"creator_id": "", *
	"color": "",
	"version": "" *
}
```

-   `name`: The name of the layout
-   `description`: A short description of your layout
-   `creator_id`: Your discord user id. You can find this by visiting [this page](https://themezer.ga/me) on Themezer. The id will be displayed in the url. You must login **at least once** before submitting.
-   `color`: A hex color to display behind the overlay (example: `#7ca982`)
-   `version`: A string with the layout version (example: "1.0")

### **Notes 1:**

-   When a pull request is merged the `uuid` field is automatically added to the `details.json`. You must never add/edit this yourself!
-   Remove the color field if not in use.
-   The version field should be updated if the base layout has changed. Not when pieces are added or updated.

**Pull requests not meeting the requirements won't be merged (right away).**

## **3. Creating Overlays**

[There is a tool for this on the Themezer website.](https://themezer.ga/tools/overlaycreator)

Simple explanation:

1.  Open a layout and optionally a piece your want to patch the json file with and/or common layout. - Click 'GET'. The tool will return two NXThemes: one with a black and one with a white background.
2.  Transfer the themes to the `themes` folder on your SD card.

For the following two steps you will have to change your system theme. For example [Flow Layout](https://themezer.ga/layouts/homemenu/Flow-Layout-5) has background panes, so the HUD, controller icon and buttons are readable. You may choose yourself if you want the screenshot to have the light or dark mode.
Now lets look at [Small Compact Homescreen](https://themezer.ga/layouts/homemenu/Small-Compact-Homescreen-15). Here there is no pane behind the hud, controller icon and buttons. The text would be unreadable due to the dark background on Themezer if screenshot was taken with light mode, so you should set it in dark mode here **OR** set a custom (lighter) background color in the `details.json` via the `color` field.

3.  Install one theme, reboot, take a screenshot.
4.  Install the other theme, reboot take a screeshot.
5.  Transfer the screenshots to your pc.
6.  Open the screenshots in the corresponding fields on the tool page.
7.  Click 'CREATE OVERLAY'.

# **Layout Submission Example**

## **Basic**

1. [Fork the repository](https://docs.github.com/en/desktop/contributing-and-collaborating-using-github-desktop/cloning-and-forking-repositories-from-github-desktop).
2. Go to the correct 'target file' (see ['Submitting' -> 'Layouts' -> 'Notes-1'](###Notes-1)) your layout is for.
3. Create a folder with the name of your layout, enter it.
4. Copy the layout json file to your layout folder as `layout.json`.  
   Also copy the common json (if you have one) as `common.json`
5. Make sure to remove the `ID` and `Ready8X` fields from the `layout.json` and (if applicable) the `common.json`.
6. Create a `details.json` and paste the following contents **and fill in your own**:

```json
{
	"name": "<The name of your layout>",
	"description": "<A description of what your layout looks like or whatever>",
	"creator_id": "<your creator ID (the ID in the url when you go to your profile on Themezer)>",
	"version": "<Anything will do here, from '1.0' to 'boomer1'>"
}
```

8. Create a layout overlay by following the ['Creating Overlays' guide](##3.-Creating-overlays) and save it as `overlay.png` in your layout folder.

## **Advanced: pieces**

9. Create a `pieces` folder, enter it.
10. Create a folder for the option you want e.g. `1_Hide eShop button` (this is displayed on Themezer), enter it.
11. Create a "value" (a combination of a json and png)

### **Checkbox**

Now if you want to have a simple checkbox you only have to create a single value:

1.  Create a json file e.g. `enable.json`, open it.

This basically has the same structure as a `layout.json` file, but the only three root (the first depth) fields it should have are `"Files"`, `"Anims"` and `"uuid"` (so no `"AuthorName"` etc.). The `uuid` one's generated by Themezer, don't add this yourself.

The values your add in this json will overwrite the values in the normal `layout.json`

2.  Create another overlay using the ['Creating Overlays' guide](##3.-Creating-overlays). Make sure to select the `enable.json` (or whatever you called it). Save the png as `enable.png`. It alwasy has to have the same file**name** (not file **extension**) as the json.

### **Dropdown**

If you prefer a dropdown with multiple choices do the same as above, but multiple times. Do note though that the json filename with now represents the dropdown text.

An example:

1. Create a folder: `2_Scale`, enter it.
2. Create a value json: `70%.json` with a `70%.png`.
3. Create another value json: `50%.json` with a `50%.png`.
