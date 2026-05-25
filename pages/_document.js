// pages/_document.js
import Document, { Html, Head, Main, NextScript } from 'next/document';

export default class MyDocument extends Document {
    render() {
        return (
            <Html lang="en">
                <Head />
                <body>
                    {/* Google Tag Manager (noscript) */}
                    <noscript
                        dangerouslySetInnerHTML={{
                            __html: `
                <iframe src="https://www.googletagmanager.com/ns.html?id=GTM-XXXXXXX"
                        height="0" width="0"
                        style="display:none;visibility:hidden"></iframe>
              `,
                        }}
                    />
                    <Main />
                    <NextScript />
                </body>
            </Html>
        );
    }
}
