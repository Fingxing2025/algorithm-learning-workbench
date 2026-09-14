// The filename is an adversarial distractor.
#include <array>
#include <string>
#include <vector>
class Trie{struct Node{std::array<int,26>next{};int prefix=0;};std::vector<Node>nodes{{}};public:void insert(const std::string&word){int node=0;for(char ch:word){int c=ch-'a';if(!nodes[node].next[c]){nodes[node].next[c]=nodes.size();nodes.push_back({});}node=nodes[node].next[c];++nodes[node].prefix;}}int count_prefix(const std::string&prefix)const{int node=0;for(char ch:prefix){node=nodes[node].next[ch-'a'];if(!node)return 0;}return nodes[node].prefix;}};
int main(){Trie trie;trie.insert("code");trie.insert("codex");return trie.count_prefix("cod")==2?0:1;}
