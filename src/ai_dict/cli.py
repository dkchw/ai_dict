import typer
import uvicorn

app = typer.Typer()

@app.command()
def serve(host: str = "127.0.0.1", port: int = 4321):
    """
    Start the AI Dictionary web server.
    """
    typer.echo(f"Starting AI Dictionary server on http://{host}:{port}")
    uvicorn.run("ai_dict.server:app", host=host, port=port, log_level="info")

@app.command()
def info():
    """Print info."""
    typer.echo("AI Dictionary App")

def main():
    app()

if __name__ == "__main__":
    main()
