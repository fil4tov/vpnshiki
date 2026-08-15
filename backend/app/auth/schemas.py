from pydantic import BaseModel

from app.users.schemas import Name


class Credentials(BaseModel):
    name: Name
    password: str

