"""Use the shared production bake evaluator; never hand-draw or synthesize frames."""
import runpy
from pathlib import Path
runpy.run_path(str(Path(__file__).resolve().parents[1]/'bake.py'),run_name='__main__')
