# As committed after Claude dead-code removal
# Source: https://github.com/jurjans/ksj-wp-func/commit/e735faf677f2f8060b7f100db4265a06444a94ce
# AI tool: Claude Code (co-authored commit)
# Gap: Claude's dead-code removal deleted get_model() from function_app.py
#      (it appeared unused at the module level).
#      But fb_gen.py imported get_model from this file and called it internally.
#      Next invocation of any FB copy endpoint raised:
#      NameError: name 'get_model' is not defined

import azure.functions as func

app = func.FunctionApp()

# BUG: Claude removed get_model() as "dead code" — it was imported by fb_gen.py
# def get_model():
#     return genai.GenerativeModel("gemini-pro")

# fb_gen.py (separate file) does:
#   from function_app import get_model
#   model = get_model()
# After this removal, every call to generate_fb_copy raises NameError

@app.route(route="generate_fb_copy")
def generate_fb_copy(req: func.HttpRequest) -> func.HttpResponse:
    from fb_gen import generate_copy  # calls get_model() internally
    result = generate_copy(req.get_json())
    return func.HttpResponse(result)
