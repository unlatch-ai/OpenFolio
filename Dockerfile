# Stage 1: Install dependencies
FROM node:20-slim AS deps
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Stage 2: Build the application
FROM node:20-slim AS build
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Build-time env vars (can be overridden)
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_OPENFOLIO_MODE
ARG NEXT_PUBLIC_OPENFOLIO_DEPLOYMENT_MODE
ARG NEXT_PUBLIC_OPENFOLIO_AUTH_MODE
ARG NEXT_PUBLIC_OPENFOLIO_BILLING_MODE
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_OPENFOLIO_MODE=$NEXT_PUBLIC_OPENFOLIO_MODE
ENV NEXT_PUBLIC_OPENFOLIO_DEPLOYMENT_MODE=$NEXT_PUBLIC_OPENFOLIO_DEPLOYMENT_MODE
ENV NEXT_PUBLIC_OPENFOLIO_AUTH_MODE=$NEXT_PUBLIC_OPENFOLIO_AUTH_MODE
ENV NEXT_PUBLIC_OPENFOLIO_BILLING_MODE=$NEXT_PUBLIC_OPENFOLIO_BILLING_MODE
RUN pnpm build

# Stage 3: Production runner
FROM node:20-slim AS runner
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app
ENV NODE_ENV=production

# Copy only what's needed for production
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
CMD ["node", "server.js"]
