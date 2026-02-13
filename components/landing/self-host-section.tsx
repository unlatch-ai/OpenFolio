export function SelfHostSection() {
  return (
    <section className="py-20 px-4 bg-muted/30">
      <div className="max-w-3xl mx-auto text-center">
        <h2 className="text-3xl font-serif font-medium mb-4">
          Self-host in minutes
        </h2>
        <p className="text-muted-foreground mb-8">
          OpenFolio runs on Docker Compose with PostgreSQL, pgvector, and
          Supabase Auth. Your data never leaves your infrastructure.
        </p>
        <div className="bg-background border rounded-lg p-6 text-left font-mono text-sm">
          <p className="text-muted-foreground"># Clone and setup</p>
          <p>git clone https://github.com/unlatch-ai/OpenFolio.git</p>
          <p>cd openfolio</p>
          <p>./scripts/setup.sh</p>
          <p className="mt-3 text-muted-foreground"># Start everything</p>
          <p>docker compose up -d</p>
          <p className="mt-3 text-muted-foreground">
            # Visit http://localhost:3000
          </p>
        </div>
      </div>
    </section>
  );
}
