export const webUi = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>ICPS Web UI</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 0;
            background-color: #f0f0f0;
        }
        .container {
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
        }
        .content {
            background-color: #fff;
            width: 16rem;
            overflow: hidden;
            border-radius: 1rem;
            box-shadow: 0 0 1rem rgba(0, 0, 0, 0.1);
        }
        .logo {
            width: 100%;
            margin: 0 auto;
        }
        .innerContent {
            padding: 2rem;
        }
        .info {
            width: 100%;
            border-collapse: collapse;
        }
        .info tr td {
            padding-bottom: 1rem;
        }
        .info tr td:last-child {
            text-align: right;
        }
        button {
            width: 100%;
            padding: 0.5rem;
            background-color:rgb(0, 20, 243);
            color: #fff;
            border: none;
            border-radius: 0.5rem;
            cursor: pointer;
            margin-top: 1rem;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="content">
            <img src="https://icps.steiler.dev/assets/icloud-photos-sync-open-graph.png" class="logo" alt="ICPS Logo">
            <div class="innerContent">
                <p color="lime" style="font-size: 6rem; text-align: center; margin:0;">&#10003;</p>
                <p color="lightgray" style="font-size: 0.5rem;">
                    Successful on
                    Sunday, 12th September 2021,
                    Synced 12 photos
                </p>
                <button>Sync Now</button>
                <button>Update MFA</button>
            </div>
        </div>
    </div>
</body>
</html>
`;