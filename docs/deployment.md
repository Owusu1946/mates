# Deployment

Deploy apps/api to a Node 22 host. Set server environment variables there. Run pnpm db:migrate as a release job, not from the mobile app. Point EXPO_PUBLIC_API_URL at the HTTPS API before EAS builds. Configure the generated app scheme as an allowed auth redirect.
