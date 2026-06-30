import uuid
from onyx.server.manage.wiki import parse_and_enforce_citations

def test_parse_and_enforce_citations():
    valid_uuid_1 = uuid.uuid4()
    valid_uuid_2 = uuid.uuid4()
    invalid_uuid = uuid.uuid4()
    
    valid_chunk_ids = {valid_uuid_1, valid_uuid_2}
    
    markdown_content = f"""# Test Wiki Title

## Section 1: Valid Info
Here is some info citing a valid chunk. [Citation: {valid_uuid_1}]

## Section 2: Invalid Citation Info
This section has an invalid citation. [Citation: {invalid_uuid}]

## Section 3: Another Valid Info
More valid info. [Citation: {valid_uuid_2}]

## Section 4: No Citation Info
This section doesn't have any citations at all.
"""

    final_content, citations = parse_and_enforce_citations(markdown_content, valid_chunk_ids)
    
    assert "Section 1: Valid Info" in final_content
    assert "Section 3: Another Valid Info" in final_content
    assert "Section 2: Invalid Citation Info" not in final_content
    assert "Section 4: No Citation Info" not in final_content
    
    assert len(citations) == 2
    assert citations[0] == ("Section 1: Valid Info", valid_uuid_1)
    assert citations[1] == ("Section 3: Another Valid Info", valid_uuid_2)
