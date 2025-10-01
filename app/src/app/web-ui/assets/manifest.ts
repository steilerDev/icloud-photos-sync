export const manifest = (basePath: string) => {
    return {
        icons: [
            {
                purpose: `any`,
                sizes: `512x512`,
                src: `${basePath}/icon.png`,
                type: `image/png`
            }
        ],
        orientation: `any`,
        display: `standalone`,
        dir: `auto`,
        lang: `en-GB`,
        description: `iCloud Photos Sync is a one-way sync engine for the iCloud Photos Library`,
        start_url: `${basePath}/state`,
        scope: `${basePath}/`,
        name: `iCloud Photos Sync`,
        short_name: `ICPS`
    }
}
