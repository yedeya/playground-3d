/// <reference path="./.sst/platform/config.d.ts" />
// The app's one deployment: the Next.js site, built with OpenNext, on CloudFront's own *.cloudfront.net address.
// There is one stage, production, so app() refuses any other: retain and protect then hold for every stage SST runs.
// The production deploy role this runs under trusts infra/aws/production-deploy-role.trust.json.

export default $config({
  app(input) {
    if (input.stage !== 'production') {
      throw new Error(`playground-3d deploys one stage, production; refusing the stage "${input.stage}"`);
    }
    return {
      name: 'playground-3d',
      home: 'aws',
      removal: 'retain',
      protect: true,
      providers: {
        aws: {
          region: 'eu-central-1',
          defaultTags: { tags: { project: 'playground-3d', stage: input.stage } },
        },
      },
    };
  },
  async run() {
    // No `domain`, so the site serves on the distribution's own address.
    const site = new sst.aws.Nextjs('Site');
    return { url: site.url };
  },
});
