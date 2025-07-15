const fetchProblemInfo = async (questionName) => {
    const body = {
        query: `
        query($titleSlug: String!) {
            question(titleSlug: $titleSlug) {
                questionFrontendId
                titleSlug
                content
                codeSnippets {
                    lang
                    langSlug
                    code
                }
            }
        }`,
        variables: {
            titleSlug: questionName
        }
    };

    try {
        const res = await fetch('https://leetcode.com/graphql', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body)
        });

        if (!res.ok) {
            console.error("status: ", res.status);
            return null;
        }

        const json = await res.json();
        return json.data.question;

    } catch (err) {
        console.log("Error fetching the problem:", err.message);
        return null;
    }
};

module.exports = fetchProblemInfo;
